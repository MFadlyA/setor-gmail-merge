import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit as checkIpRateLimit } from "@/lib/security/rate-limiter";
import { validateCsrf } from "@/lib/security/csrf";
import {
  validateEWalletNumber,
  sanitizeErrorMessage,
  MAX_INSTANT_WITHDRAWAL,
} from "@/lib/security";
import { getDanaConfig, isDanaConfigured } from "@/lib/dana/client";
import {
  AUTO_DISBURSE_MAX_AMOUNT,
  inquireDanaAccount,
} from "@/lib/dana/disbursement";

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

/**
 * Pre-withdrawal DANA Account Inquiry (`POST /api/user/withdrawals/inquiry`)
 * Verifies destination DANA number & returns `customerName` + limits so the user can confirm
 * the recipient name before submitting their withdrawal.
 */
export async function POST(req: NextRequest) {
  const csrf = validateCsrf(req);
  if (!csrf.valid) {
    return NextResponse.json(
      { success: false, error: "Akses ditolak: Validasi keamanan permintaan gagal." },
      { status: 403 }
    );
  }

  const ipRate = checkIpRateLimit(
    req,
    { maxRequests: 15, windowMs: 60_000 },
    "user_dana_inquiry_ip"
  );
  if (!ipRate.success) {
    return NextResponse.json(
      { success: false, error: "Terlalu banyak pengecekan nomor DANA. Tunggu sebentar." },
      { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSeconds) } }
    );
  }

  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Akses ditolak: Sesi login tidak ditemukan." },
        { status: 401 }
      );
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json(
        { success: false, error: "Akses ditolak: Sesi login tidak sah atau kedaluwarsa." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Payload pengecekan akun DANA tidak valid." },
        { status: 400 }
      );
    }

    const phoneCheck = validateEWalletNumber(body.accountNumber);
    if (!phoneCheck.valid) {
      return NextResponse.json(
        { success: false, error: phoneCheck.error || "Nomor DANA tidak valid." },
        { status: 400 }
      );
    }

    const rawAmount = Math.floor(Number(body.amount) || 0);
    if (!Number.isFinite(rawAmount) || rawAmount < 1000 || rawAmount > MAX_INSTANT_WITHDRAWAL) {
      return NextResponse.json(
        { success: false, error: "Nominal penarikan tidak valid." },
        { status: 400 }
      );
    }

    // Load CMS tax for DANA
    let danaTax = 0;
    const { data: cfgRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "site_config")
      .maybeSingle();

    if (cfgRow?.value) {
      try {
        const parsed = typeof cfgRow.value === "string" ? JSON.parse(cfgRow.value) : cfgRow.value;
        if (parsed?.is_withdrawal_active === false || parsed?.is_dana_active === false) {
          return NextResponse.json(
            { success: false, error: "Layanan penarikan DANA sedang dinonaktifkan sementara." },
            { status: 403 }
          );
        }
        danaTax =
          parsed?.tax_dana_active === false
            ? 0
            : Math.max(0, Math.floor(Number(parsed?.tax_dana) || 0));
      } catch {
        // use defaults
      }
    }

    const netAmount = Math.max(0, rawAmount - danaTax);
    if (netAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Nominal bersih harus lebih besar dari biaya admin." },
        { status: 400 }
      );
    }

    if (!isDanaConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Layanan verifikasi API DANA belum dikonfigurasi pada environment server.",
        },
        { status: 503 }
      );
    }

    const inquiry = await inquireDanaAccount({
      phoneNumber: phoneCheck.cleaned,
      amountIdr: netAmount,
    });

    if (!inquiry.ok) {
      return NextResponse.json(
        {
          success: false,
          code: inquiry.responseCode,
          error: inquiry.friendlyError || "Nomor DANA tidak ditemukan atau tidak aktif.",
        },
        { status: 400 }
      );
    }

    if (inquiry.maxAmountIdr > 0 && netAmount > inquiry.maxAmountIdr) {
      return NextResponse.json(
        {
          success: false,
          code: "EXCEEDS_MAX_AMOUNT",
          error: `Nominal melebihi sisa batas saldo akun DANA tujuan (maksimal Rp${inquiry.maxAmountIdr.toLocaleString("id-ID")}).`,
        },
        { status: 400 }
      );
    }

    const cfg = getDanaConfig();
    return NextResponse.json({
      success: true,
      customerName: inquiry.customerName,
      customerNumber: inquiry.customerNumber,
      accountNumber: phoneCheck.cleaned,
      amount: rawAmount,
      taxFee: danaTax,
      netAmount,
      maxAmount: inquiry.maxAmountIdr,
      autoDisburse: rawAmount <= AUTO_DISBURSE_MAX_AMOUNT,
      autoDisburseMaxAmount: AUTO_DISBURSE_MAX_AMOUNT,
      env: cfg.env,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(err, "Gagal memeriksa akun DANA.") },
      { status: 500 }
    );
  }
}
