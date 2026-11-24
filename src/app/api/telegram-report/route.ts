import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, readServerEnv } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limiter";
import { validateCsrf } from "@/lib/security/csrf";
import { escapeMarkdown } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const ALLOWED_REPORT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function stripControlAndHtml(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .slice(0, maxLen)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<[^>]+>/g, "");
}

export async function POST(req: NextRequest) {
  // 1. CSRF Protection
  const csrf = validateCsrf(req);
  if (!csrf.valid) {
    return NextResponse.json(
      { ok: false, error: "Akses ditolak: Validasi keamanan permintaan gagal." },
      { status: 403 }
    );
  }

  // 2. Strict IP Rate Limit (max 5 reports per 5 minutes)
  const rate = checkRateLimit(req, { maxRequests: 5, windowMs: 5 * 60_000 }, "telegram_report");
  if (!rate.success) {
    return NextResponse.json(
      { ok: false, error: "Batas pengiriman laporan tercapai. Silakan coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  // 3. Require authenticated Supabase user session (prevents anonymous Telegram spam)
  const authHeader = req.headers.get("authorization");
  const token =
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) ||
    req.cookies.get("sb-access-token")?.value ||
    null;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Akses ditolak: Sesi autentikasi diperlukan." },
      { status: 401 }
    );
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return NextResponse.json(
      { ok: false, error: "Akses ditolak: Sesi autentikasi tidak sah." },
      { status: 401 }
    );
  }

  // 4. Read secrets strictly from server environment (NEVER hardcoded)
  const botToken = readServerEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readServerEnv("TELEGRAM_CHAT_ID");
  if (!botToken || !chatId) {
    return NextResponse.json(
      { ok: false, error: "Layanan pelaporan Telegram belum dikonfigurasi pada server." },
      { status: 503 }
    );
  }

  const clientIp = getClientIp(req);
  let kategori = "";
  let judul = "";
  let deskripsi = "";
  let attachedFile: File | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await req.formData();
      kategori = stripControlAndHtml(formData.get("kategori"), 60);
      judul = stripControlAndHtml(formData.get("judul"), 150);
      deskripsi = stripControlAndHtml(formData.get("deskripsi"), 2000);
      const fileEntry = formData.get("file");
      if (fileEntry instanceof File && fileEntry.size > 0) {
        if (fileEntry.size > 5 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: "Ukuran file bukti maksimal 5MB." },
            { status: 400 }
          );
        }
        if (!ALLOWED_REPORT_MIME_TYPES.has(fileEntry.type)) {
          return NextResponse.json(
            { ok: false, error: "Format bukti hanya mendukung JPG, PNG, WebP, atau PDF." },
            { status: 400 }
          );
        }
        attachedFile = fileEntry;
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Data formulir tidak valid." }, { status: 400 });
    }
  } else {
    try {
      const body = await req.json();
      kategori = stripControlAndHtml(body?.kategori, 60);
      judul = stripControlAndHtml(body?.judul, 150);
      deskripsi = stripControlAndHtml(body?.deskripsi, 2000);
    } catch {
      return NextResponse.json({ ok: false, error: "JSON tidak valid." }, { status: 400 });
    }
  }

  if (!kategori || !judul || !deskripsi) {
    return NextResponse.json(
      { ok: false, error: "Kategori, judul, dan deskripsi wajib diisi." },
      { status: 400 }
    );
  }

  const waktuJakarta = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const messageText =
    `📋 *Laporan Terverifikasi*\n` +
    `👤 *Email:* ${escapeMarkdown(authData.user.email || "-")}\n` +
    `🆔 *UID:* ${escapeMarkdown(authData.user.id)}\n` +
    `🌐 *IP:* ${escapeMarkdown(clientIp)}\n\n` +
    `🏷️ *Kategori:* ${escapeMarkdown(kategori)}\n` +
    `📌 *Judul:* ${escapeMarkdown(judul)}\n\n` +
    `📝 *Deskripsi:*\n${escapeMarkdown(deskripsi)}\n\n` +
    `⏰ _Waktu: ${escapeMarkdown(waktuJakarta)} WIB_`;

  try {
    let response: Response;
    if (attachedFile) {
      const safeFileName = attachedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "bukti";
      const fileForm = new FormData();
      fileForm.append("chat_id", chatId);
      fileForm.append("document", attachedFile, safeFileName);
      fileForm.append("caption", messageText.slice(0, 1024));
      fileForm.append("parse_mode", "Markdown");
      response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: "POST",
        body: fileForm,
      });
    } else {
      response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: "Markdown",
        }),
      });
    }

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "Gagal meneruskan laporan ke saluran admin." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Gagal menghubungi layanan pelaporan." },
      { status: 502 }
    );
  }
}
