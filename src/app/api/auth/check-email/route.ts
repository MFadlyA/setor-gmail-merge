import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getSupabaseAdminConfig } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limiter";
import { validateCsrf } from "@/lib/security/csrf";

export async function POST(req: NextRequest) {
  try {
    const csrf = validateCsrf(req);
    if (!csrf.valid) {
      return NextResponse.json(
        { exists: false, error: "Validasi keamanan permintaan gagal." },
        { status: 403 }
      );
    }

    const rate = checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, "check_email");
    if (!rate.success) {
      return NextResponse.json(
        { exists: false, error: "Terlalu banyak percobaan. Silakan tunggu 1 menit." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string" || email.length > 120) {
      return NextResponse.json({ exists: false, error: "Email wajib diisi" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanEmail)) {
      return NextResponse.json({ exists: false, error: "Format email tidak valid" }, { status: 400 });
    }

    const { hasServiceRoleKey } = getSupabaseAdminConfig();
    if (!hasServiceRoleKey) {
      // Avoid disclosing account existence if service role key is absent
      void getClientIp(req);
      return NextResponse.json({ exists: true });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", cleanEmail)
      .limit(1);

    if (error) {
      return NextResponse.json(
        { exists: false, error: "Gagal memeriksa ketersediaan email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ exists: Boolean(data && data.length > 0) });
  } catch {
    return NextResponse.json(
      { exists: false, error: "Terjadi kesalahan sistem." },
      { status: 500 }
    );
  }
}
