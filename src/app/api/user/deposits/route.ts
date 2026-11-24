import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit as checkIpRateLimit, RATE_LIMITS } from "@/lib/security/rate-limiter";
import { validateCsrf } from "@/lib/security/csrf";
import {
  sanitizeInputText,
  isValidStrictGmail,
  checkRateLimit as checkKeyRateLimit,
  sanitizeErrorMessage,
} from "@/lib/security";

export const dynamic = "force-dynamic";

function extractBearerOrCookieToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return (
    req.cookies.get("sb-access-token")?.value ||
    req.cookies.get("sb-auth-token")?.value ||
    null
  );
}

export async function POST(req: NextRequest) {
  // 1. Anti-CSRF protection
  const csrf = validateCsrf(req);
  if (!csrf.valid) {
    return NextResponse.json(
      { success: false, insertedCount: 0, error: "Akses ditolak: Validasi keamanan permintaan gagal." },
      { status: 403 }
    );
  }

  // 2. Edge/IP Rate limit
  const ipRate = checkIpRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, "user_deposit_ip");
  if (!ipRate.success) {
    return NextResponse.json(
      {
        success: false,
        insertedCount: 0,
        error: "Terlalu banyak permintaan setor dalam waktu singkat. Mohon tunggu sebentar.",
      },
      { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSeconds) } }
    );
  }

  try {
    // 3. Cryptographic JWT verification via Supabase Auth
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Akses ditolak: Sesi login tidak ditemukan." },
        { status: 401 }
      );
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Akses ditolak: Sesi login tidak sah atau kedaluwarsa." },
        { status: 401 }
      );
    }

    const user = authData.user;
    if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Akun Anda sedang diblokir dari melakukan transaksi." },
        { status: 403 }
      );
    }

    // Per-user submission rate limit (max 6 per minute)
    const userRate = checkKeyRateLimit(`deposit:${user.id}`, 6, 60_000);
    if (!userRate.allowed) {
      return NextResponse.json(
        {
          success: false,
          insertedCount: 0,
          error: "Terlalu banyak permintaan setor dalam waktu singkat. Mohon tunggu 1 menit.",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // 4. Parse & validate payload
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Payload permintaan tidak valid." },
        { status: 400 }
      );
    }

    const rawEmails = Array.isArray(body.emails) ? body.emails : [];
    if (rawEmails.length === 0) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Daftar email tidak boleh kosong." },
        { status: 400 }
      );
    }

    if (rawEmails.length > 10) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Maksimal 10 Gmail per pengiriman setoran." },
        { status: 400 }
      );
    }

    const cleanCategory = body.categoryId === "bebas" ? "bebas" : "good";
    const rawPasswordInput =
      typeof body.password === "string" && body.password.trim()
        ? sanitizeInputText(body.password.trim(), 120)
        : undefined;
    const rawNoteInput =
      typeof body.note === "string" && body.note.trim()
        ? sanitizeInputText(body.note.trim(), 200)
        : undefined;

    // Backward-compatible extraction if legacy client sent "Password: xxx" in note
    const legacyNotePassword =
      !rawPasswordInput && rawNoteInput && /^Password:\s*/i.test(rawNoteInput)
        ? rawNoteInput.replace(/^Password:\s*/i, "").trim()
        : undefined;

    const cleanNote =
      rawNoteInput && !/^Password:\s*/i.test(rawNoteInput) ? rawNoteInput : undefined;

    // 5. Fetch authoritative CMS settings (maintenance, feature flag, default_password, and server-side price)
    let authoritativePrice = cleanCategory === "bebas" ? 1000 : 1500;
    let authoritativeDefaultPassword = "winter1212";
    const { data: cfgRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "site_config")
      .maybeSingle();

    if (cfgRow?.value) {
      try {
        const parsed = typeof cfgRow.value === "string" ? JSON.parse(cfgRow.value) : cfgRow.value;
        if (parsed?.is_maintenance_mode) {
          return NextResponse.json(
            {
              success: false,
              insertedCount: 0,
              error: parsed.maintenance_message || "Platform sedang dalam pemeliharaan sistem.",
            },
            { status: 503 }
          );
        }
        if (parsed?.is_setor_active === false) {
          return NextResponse.json(
            { success: false, insertedCount: 0, error: "Layanan Setor Gmail sedang dinonaktifkan sementara oleh Admin." },
            { status: 403 }
          );
        }
        if (typeof parsed?.default_password === "string" && parsed.default_password.trim()) {
          authoritativeDefaultPassword = sanitizeInputText(parsed.default_password.trim(), 120);
        }
        const dbPrice = Number(cleanCategory === "bebas" ? parsed?.price_bebas : parsed?.price_per_gmail);
        if (Number.isFinite(dbPrice) && dbPrice >= 500 && dbPrice <= 100_000) {
          authoritativePrice = Math.floor(dbPrice);
        }
      } catch {
        // fallback to defaults
      }
    }

    const resolvedPassword =
      cleanCategory === "bebas"
        ? rawPasswordInput || legacyNotePassword || ""
        : authoritativeDefaultPassword;

    if (cleanCategory === "bebas" && !resolvedPassword) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Password email wajib diisi untuk Setor Email Lama." },
        { status: 400 }
      );
    }

    // Ensure category exists in setor_categories so FK never fails
    await supabaseAdmin.from("setor_categories").upsert(
      {
        id: cleanCategory,
        label: cleanCategory === "bebas" ? "Gmail Lama" : "Gmail Fresh",
        price: authoritativePrice,
        is_active: true,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

    // Ensure user profile exists before inserting deposit
    await supabaseAdmin.from("profiles").upsert(
      {
        id: user.id,
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Pengguna",
        email: user.email || `${user.id}@setorgmail.local`,
        role: "User",
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

    // 6. Normalize & deduplicate candidate emails
    const seenNormalized = new Set<string>();
    const candidateRecords = rawEmails
      .filter((e: unknown) => isValidStrictGmail(e))
      .map((email: string) => {
        const clean = sanitizeInputText(email, 120).toLowerCase();
        const atIdx = clean.lastIndexOf("@");
        const normalized =
          atIdx !== -1
            ? clean.slice(0, atIdx).replace(/\./g, "") + "@gmail.com"
            : clean;

        return {
          user_id: user.id,
          gmail: clean,
          normalized_gmail: normalized,
          password: resolvedPassword,
          category_id: cleanCategory,
          status: "pending",
          amount: authoritativePrice,
          ...(cleanNote ? { note: cleanNote } : {}),
        };
      })
      .filter((rec: { normalized_gmail: string }) => {
        if (seenNormalized.has(rec.normalized_gmail)) return false;
        seenNormalized.add(rec.normalized_gmail);
        return true;
      });

    if (candidateRecords.length === 0) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: "Tidak ada email Gmail valid untuk disetor." },
        { status: 400 }
      );
    }

    // 7. Global duplicate check across ALL deposits in database
    const normalizedList = candidateRecords.map((r: { normalized_gmail: string }) => r.normalized_gmail);
    const { data: existingRows } = await supabaseAdmin
      .from("deposits")
      .select("normalized_gmail")
      .in("normalized_gmail", normalizedList);

    const existingSet = new Set(
      (existingRows || []).map((row: { normalized_gmail?: string }) =>
        String(row.normalized_gmail || "").toLowerCase()
      )
    );

    const records = candidateRecords.filter(
      (r: { normalized_gmail: string }) => !existingSet.has(r.normalized_gmail.toLowerCase())
    );

    if (records.length === 0) {
      return NextResponse.json(
        {
          success: false,
          insertedCount: 0,
          error: "Semua akun Gmail tersebut sudah pernah disetorkan sebelumnya.",
        },
        { status: 409 }
      );
    }

    let { data: inserted, error: insertErr } = await supabaseAdmin
      .from("deposits")
      .insert(records)
      .select("id");

    // Zero-downtime fallback if `password` column has not yet been added in Supabase SQL Editor
    if (insertErr && /password/i.test(insertErr.message || "")) {
      const legacyRecords = records.map(({ password, ...rest }: any) => ({
        ...rest,
        note: rest.note || (password ? `Password: ${password}` : undefined),
      }));
      const retry = await supabaseAdmin.from("deposits").insert(legacyRecords).select("id");
      inserted = retry.data;
      insertErr = retry.error;
    }

    if (insertErr) {
      return NextResponse.json(
        { success: false, insertedCount: 0, error: sanitizeErrorMessage(insertErr, "Gagal menyimpan data setoran.") },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      insertedCount: inserted?.length || records.length,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, insertedCount: 0, error: sanitizeErrorMessage(err, "Gagal menyimpan data setoran.") },
      { status: 500 }
    );
  }
}
