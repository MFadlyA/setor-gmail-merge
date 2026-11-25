import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit as checkIpRateLimit, getClientIp } from "@/lib/security/rate-limiter";
import { validateCsrf } from "@/lib/security/csrf";
import { logAuditEvent } from "@/lib/security/audit-logger";
import {
  sanitizeInputText,
  validateEWalletNumber,
  validateWithdrawalAmount,
  sanitizeErrorMessage,
  MAX_WITHDRAWALS_PER_DAY,
  MAX_INSTANT_WITHDRAWAL,
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
  const clientIp = getClientIp(req);
  const country = req.headers.get("cf-ipcountry") || null;
  const userAgent = req.headers.get("user-agent") || null;

  // 1. Anti-CSRF validation
  const csrf = validateCsrf(req);
  if (!csrf.valid) {
    return NextResponse.json(
      { success: false, error: "Akses ditolak: Validasi keamanan permintaan gagal." },
      { status: 403 }
    );
  }

  // 2. IP rate limiting
  const ipRate = checkIpRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, "user_withdrawal_ip");
  if (!ipRate.success) {
    return NextResponse.json(
      { success: false, error: "Terlalu banyak percobaan penarikan. Silakan tunggu sebentar." },
      { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSeconds) } }
    );
  }

  try {
    // 3. Cryptographic JWT session check
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

    const user = authData.user;
    if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
      return NextResponse.json(
        { success: false, error: "Akun Anda sedang diblokir dari melakukan penarikan." },
        { status: 403 }
      );
    }

    // 4. Parse & validate input
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Payload penarikan tidak valid." },
        { status: 400 }
      );
    }

    const validMethods = ["DANA", "GOPAY", "OVO", "SHOPEEPAY"];
    const cleanMethod = sanitizeInputText(body.method, 20).toUpperCase();
    if (!validMethods.includes(cleanMethod)) {
      return NextResponse.json(
        { success: false, error: "Metode pembayaran e-wallet tidak valid." },
        { status: 400 }
      );
    }

    const phoneCheck = validateEWalletNumber(body.accountNumber);
    if (!phoneCheck.valid) {
      return NextResponse.json(
        { success: false, error: phoneCheck.error || "Nomor e-wallet tidak valid." },
        { status: 400 }
      );
    }

    // 5. Load authoritative CMS configuration (tax, min_withdrawal, daily limit, active flags)
    let authoritativeMinWithdrawal = 5000;
    let hasCmsMinWithdrawal = false;
    let authoritativeMaxWithdrawalsPerDay = MAX_WITHDRAWALS_PER_DAY;
    let authoritativeTax = 0;

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
            { success: false, error: parsed.maintenance_message || "Platform sedang dalam pemeliharaan sistem." },
            { status: 503 }
          );
        }
        if (parsed?.is_withdrawal_active === false) {
          return NextResponse.json(
            { success: false, error: "Layanan penarikan saldo sedang dinonaktifkan sementara oleh Admin." },
            { status: 403 }
          );
        }

        const methodActiveMap: Record<string, boolean> = {
          DANA: parsed?.is_dana_active !== false,
          GOPAY: parsed?.is_gopay_active !== false,
          OVO: parsed?.is_ovo_active !== false,
          SHOPEEPAY: parsed?.is_shopeepay_active !== false,
        };
        if (!methodActiveMap[cleanMethod]) {
          return NextResponse.json(
            { success: false, error: `Metode penarikan ${cleanMethod} sedang tidak aktif.` },
            { status: 400 }
          );
        }

        if (Number.isFinite(Number(parsed?.min_withdrawal)) && Number(parsed.min_withdrawal) >= 1000) {
          authoritativeMinWithdrawal = Math.floor(Number(parsed.min_withdrawal));
          hasCmsMinWithdrawal = true;
        }

        if (
          Number.isFinite(Number(parsed?.max_withdrawals_per_day)) &&
          Number(parsed.max_withdrawals_per_day) >= 1
        ) {
          authoritativeMaxWithdrawalsPerDay = Math.min(
            50,
            Math.max(1, Math.floor(Number(parsed.max_withdrawals_per_day)))
          );
        }

        const taxMap: Record<string, number> = {
          DANA: parsed?.tax_dana_active === false ? 0 : Math.max(0, Math.floor(Number(parsed?.tax_dana) || 0)),
          GOPAY: parsed?.tax_gopay_active === false ? 0 : Math.max(0, Math.floor(Number(parsed?.tax_gopay) ?? 1000)),
          OVO: parsed?.tax_ovo_active === false ? 0 : Math.max(0, Math.floor(Number(parsed?.tax_ovo) ?? 1000)),
          SHOPEEPAY: parsed?.tax_shopeepay_active === false ? 0 : Math.max(0, Math.floor(Number(parsed?.tax_shopeepay) || 0)),
        };
        authoritativeTax = taxMap[cleanMethod] ?? 0;
      } catch {
        // fallback defaults
      }
    } else if (cleanMethod === "GOPAY" || cleanMethod === "OVO") {
      authoritativeTax = 1000;
    }

    // 6. Enforce daily withdrawal frequency cap (WIB / UTC+7 calendar day, excluding rejected)
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const wibToday = new Date(Date.now() + wibOffsetMs);
    wibToday.setUTCHours(0, 0, 0, 0);
    const startOfWibDayIso = new Date(wibToday.getTime() - wibOffsetMs).toISOString();

    const { count: dailyCount } = await supabaseAdmin
      .from("withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfWibDayIso)
      .not("status", "in", '("ditolak","rejected","failed")');

    if (typeof dailyCount === "number" && dailyCount >= authoritativeMaxWithdrawalsPerDay) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Batas frekuensi penarikan harian untuk akun Anda telah tercapai demi keamanan. Silakan coba kembali besok.",
        },
        { status: 429 }
      );
    }

    // 7. Fetch current wallet & validate amount against authoritative minimum & balance
    const { data: currentWallet, error: walletFetchErr } = await supabaseAdmin
      .from("wallets")
      .select("balance, total_withdrawn, minimum_withdrawal")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletFetchErr || !currentWallet) {
      return NextResponse.json(
        { success: false, error: "Data dompet tidak ditemukan atau sistem sedang sibuk." },
        { status: 404 }
      );
    }

    const effectiveMin = hasCmsMinWithdrawal
      ? authoritativeMinWithdrawal
      : Math.max(1000, Number(currentWallet.minimum_withdrawal) || authoritativeMinWithdrawal);

    const currentBalance = Number(currentWallet.balance) || 0;
    const amountVal = validateWithdrawalAmount(body.amount, currentBalance, effectiveMin);
    if (!amountVal.valid) {
      return NextResponse.json(
        { success: false, error: amountVal.error },
        { status: 400 }
      );
    }

    const requestedAmount = amountVal.cleanAmount;

    if (requestedAmount < effectiveMin) {
      return NextResponse.json(
        {
          success: false,
          error: `Minimal penarikan saldo adalah Rp${effectiveMin.toLocaleString("id-ID")}.`,
        },
        { status: 400 }
      );
    }

    if (requestedAmount > MAX_INSTANT_WITHDRAWAL) {
      return NextResponse.json(
        {
          success: false,
          error: `Batas maksimal penarikan instan adalah Rp${MAX_INSTANT_WITHDRAWAL.toLocaleString("id-ID")}.`,
        },
        { status: 400 }
      );
    }

    if (requestedAmount <= authoritativeTax) {
      return NextResponse.json(
        {
          success: false,
          error: "Nominal penarikan harus lebih besar dari biaya admin e-wallet.",
        },
        { status: 400 }
      );
    }

    const currentWithdrawn = Number(currentWallet.total_withdrawn) || 0;
    const newBalance = currentBalance - requestedAmount;
    const newTotalWithdrawn = currentWithdrawn + requestedAmount;
    const cleanNet = Math.max(0, requestedAmount - authoritativeTax);

    // 8. Atomic conditional balance deduction (prevents double-spend race condition)
    const { data: updatedWallet, error: updateErr } = await supabaseAdmin
      .from("wallets")
      .update({
        balance: newBalance,
        total_withdrawn: newTotalWithdrawn,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("balance", currentBalance)
      .gte("balance", requestedAmount)
      .select("balance");

    if (updateErr || !updatedWallet || updatedWallet.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Penarikan gagal: Terjadi perubahan saldo bersamaan atau saldo tidak mencukupi.",
        },
        { status: 409 }
      );
    }

    // 9. Insert withdrawal record with server-computed tax & net_amount
    const { data: withdrawalData, error: withdrawalErr } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        user_id: user.id,
        amount: requestedAmount,
        tax_fee: authoritativeTax,
        net_amount: cleanNet,
        method: cleanMethod,
        account_number: phoneCheck.cleaned,
        status: "diproses",
      })
      .select("id")
      .single();

    if (withdrawalErr || !withdrawalData) {
      // Rollback deducted balance safely
      await supabaseAdmin
        .from("wallets")
        .update({
          balance: currentBalance,
          total_withdrawn: currentWithdrawn,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return NextResponse.json(
        { success: false, error: sanitizeErrorMessage(withdrawalErr, "Gagal mencatat transaksi penarikan.") },
        { status: 500 }
      );
    }

    // 10. Record ledger transaction entry
    await supabaseAdmin.from("transactions").insert({
      user_id: user.id,
      type: "withdrawal",
      amount: requestedAmount,
      title: "Penarikan Saldo",
      description: `${cleanMethod} ${phoneCheck.cleaned}`,
      status: "pending",
      reference_id: withdrawalData.id,
    });

    await logAuditEvent({
      event: "WITHDRAWAL_STATUS_CHANGE",
      severity: "INFO",
      actorId: user.id,
      actorEmail: user.email,
      targetId: withdrawalData.id,
      ip: clientIp,
      country,
      userAgent,
      details: {
        action: "USER_REQUEST_WITHDRAWAL",
        amount: requestedAmount,
        taxFee: authoritativeTax,
        netAmount: cleanNet,
        method: cleanMethod,
      },
    });

    return NextResponse.json({
      success: true,
      id: withdrawalData.id,
      netAmount: cleanNet,
      taxFee: authoritativeTax,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(err, "Gagal memproses penarikan saldo.") },
      { status: 500 }
    );
  }
}
