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
import { isDanaConfigured } from "@/lib/dana/client";
import {
  AUTO_DISBURSE_MAX_AMOUNT,
  checkMdaBalance,
  disburseToDana,
  generatePartnerReferenceNo,
  inquireDanaAccount,
} from "@/lib/dana/disbursement";
import { atomicRefundWithdrawal } from "@/lib/dana/refund";

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
 * Helper to update `withdrawals` safely with automatic fallback if DANA tracking columns
 * have not yet been migrated in Supabase SQL Editor.
 */
async function safeUpdateWithdrawal(
  id: string,
  payload: Record<string, unknown>,
  expectedPrevStatus?: string
): Promise<boolean> {
  let q = supabaseAdmin.from("withdrawals").update(payload).eq("id", id);
  if (expectedPrevStatus !== undefined) {
    q = q.eq("status", expectedPrevStatus);
  }
  let { data, error } = await q.select("id");

  if (error && /dana_/i.test(error.message || "")) {
    console.warn(
      "[SUPABASE_MIGRATION_MISSING] Kolom dana_* belum ada di tabel withdrawals. Jalankan migrasi SQL DANA di Supabase."
    );
    const fallbackPayload = { ...payload };
    delete fallbackPayload.dana_partner_reference_no;
    delete fallbackPayload.dana_reference_no;
    delete fallbackPayload.dana_response_code;
    delete fallbackPayload.dana_response_message;
    delete fallbackPayload.dana_checked_at;

    let retryQ = supabaseAdmin.from("withdrawals").update(fallbackPayload).eq("id", id);
    if (expectedPrevStatus !== undefined) {
      retryQ = retryQ.eq("status", expectedPrevStatus);
    }
    const retry = await retryQ.select("id");
    data = retry.data;
    error = retry.error;
  }

  return Boolean(!error && data && data.length > 0);
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

    // 4. Parse & validate input — Strictly DANA only
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Payload penarikan tidak valid." },
        { status: 400 }
      );
    }

    const cleanMethod = sanitizeInputText(body.method, 20).toUpperCase();
    if (cleanMethod !== "DANA") {
      return NextResponse.json(
        { success: false, error: "Saat ini penarikan saldo hanya mendukung metode DANA." },
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
        if (parsed?.is_withdrawal_active === false || parsed?.is_dana_active === false) {
          return NextResponse.json(
            { success: false, error: "Layanan penarikan saldo DANA sedang dinonaktifkan sementara oleh Admin." },
            { status: 403 }
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

        authoritativeTax =
          parsed?.tax_dana_active === false
            ? 0
            : Math.max(0, Math.floor(Number(parsed?.tax_dana) || 0));
      } catch {
        // fallback defaults
      }
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

    const cleanNet = Math.max(0, requestedAmount - authoritativeTax);

    // 8. Verify DANA Account Inquiry BEFORE debiting user's wallet
    if (!isDanaConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Integrasi pencairan DANA belum aktif di server. Silakan coba beberapa saat lagi.",
        },
        { status: 503 }
      );
    }

    const inquiry = await inquireDanaAccount({
      phoneNumber: phoneCheck.cleaned,
      amountIdr: cleanNet,
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

    if (inquiry.maxAmountIdr > 0 && cleanNet > inquiry.maxAmountIdr) {
      return NextResponse.json(
        {
          success: false,
          code: "EXCEEDS_MAX_AMOUNT",
          error: `Nominal penarikan melebihi sisa batas saldo akun DANA tujuan (maksimal Rp${inquiry.maxAmountIdr.toLocaleString("id-ID")}).`,
        },
        { status: 400 }
      );
    }

    const verifiedCustomerName = sanitizeInputText(inquiry.customerName || "Pengguna DANA", 120);
    const isAutoDisburseEligible = requestedAmount <= AUTO_DISBURSE_MAX_AMOUNT;

    const currentWithdrawn = Number(currentWallet.total_withdrawn) || 0;
    const newBalance = currentBalance - requestedAmount;
    const newTotalWithdrawn = currentWithdrawn + requestedAmount;
    const nowIso = new Date().toISOString();

    // 9. Atomic conditional balance deduction (prevents double-spend race condition)
    const { data: updatedWallet, error: updateErr } = await supabaseAdmin
      .from("wallets")
      .update({
        balance: newBalance,
        total_withdrawn: newTotalWithdrawn,
        updated_at: nowIso,
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

    // 10. Insert withdrawal record (`status: 'diproses'`) with verified `account_name`
    const initialInsertPayload: Record<string, unknown> = {
      user_id: user.id,
      amount: requestedAmount,
      tax_fee: authoritativeTax,
      net_amount: cleanNet,
      method: "DANA",
      account_number: phoneCheck.cleaned,
      account_name: verifiedCustomerName,
      status: "diproses",
      dana_response_code: isAutoDisburseEligible ? "INQUIRY_OK" : "WAIT_ADMIN_APPROVAL",
      dana_response_message: isAutoDisburseEligible
        ? "Memproses pencairan otomatis DANA"
        : `Nominal di atas Rp${AUTO_DISBURSE_MAX_AMOUNT.toLocaleString("id-ID")} menunggu persetujuan Admin`,
    };

    let { data: withdrawalData, error: withdrawalErr } = await supabaseAdmin
      .from("withdrawals")
      .insert(initialInsertPayload)
      .select("id")
      .single();

    if (withdrawalErr && /dana_/i.test(withdrawalErr.message || "")) {
      const legacyPayload = {
        user_id: user.id,
        amount: requestedAmount,
        tax_fee: authoritativeTax,
        net_amount: cleanNet,
        method: "DANA",
        account_number: phoneCheck.cleaned,
        account_name: verifiedCustomerName,
        status: "diproses",
      };
      const retry = await supabaseAdmin
        .from("withdrawals")
        .insert(legacyPayload)
        .select("id")
        .single();
      withdrawalData = retry.data;
      withdrawalErr = retry.error;
    }

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

    const wdId = withdrawalData.id;

    // 11. Branch A: Nominal > Rp10.000 -> Queue for Admin Approval
    if (!isAutoDisburseEligible) {
      await supabaseAdmin.from("transactions").insert({
        user_id: user.id,
        type: "withdrawal",
        amount: requestedAmount,
        title: "Penarikan Saldo DANA",
        description: `DANA ${phoneCheck.cleaned} a/n ${verifiedCustomerName}`,
        status: "pending",
        reference_id: wdId,
      });

      await logAuditEvent({
        event: "WITHDRAWAL_STATUS_CHANGE",
        severity: "INFO",
        actorId: user.id,
        actorEmail: user.email,
        targetId: wdId,
        ip: clientIp,
        country,
        userAgent,
        details: {
          action: "USER_REQUEST_WITHDRAWAL_QUEUE_ADMIN",
          amount: requestedAmount,
          netAmount: cleanNet,
          accountNumber: phoneCheck.cleaned,
          customerName: verifiedCustomerName,
        },
      });

      return NextResponse.json({
        success: true,
        id: wdId,
        status: "diproses",
        autoDisbursed: false,
        requiresAdminApproval: true,
        customerName: verifiedCustomerName,
        netAmount: cleanNet,
        taxFee: authoritativeTax,
      });
    }

    // 12. Branch B: Nominal <= Rp10.000 -> Instant Auto-Disburse to DANA Balance!
    // Pre-check MDA balance if DANA_MERCHANT_ID is configured
    const mdaCheck = await checkMdaBalance();
    if (mdaCheck.ok && typeof mdaCheck.balanceIdr === "number" && mdaCheck.balanceIdr < cleanNet) {
      await safeUpdateWithdrawal(wdId, {
        dana_response_code: "MDA_INSUFFICIENT",
        dana_response_message: "Saldo MDA di bawah nominal penarikan; dialihkan ke antrean Admin",
        updated_at: new Date().toISOString(),
      });

      await supabaseAdmin.from("transactions").insert({
        user_id: user.id,
        type: "withdrawal",
        amount: requestedAmount,
        title: "Penarikan Saldo DANA",
        description: `DANA ${phoneCheck.cleaned} a/n ${verifiedCustomerName}`,
        status: "pending",
        reference_id: wdId,
      });

      return NextResponse.json({
        success: true,
        id: wdId,
        status: "diproses",
        autoDisbursed: false,
        requiresAdminApproval: true,
        customerName: verifiedCustomerName,
        netAmount: cleanNet,
        taxFee: authoritativeTax,
      });
    }

    // Write-ahead idempotency key BEFORE calling `transferToDana`
    const partnerRefNo = generatePartnerReferenceNo("WD", wdId);
    await safeUpdateWithdrawal(wdId, {
      dana_partner_reference_no: partnerRefNo,
      dana_response_code: "DISBURSING",
      updated_at: new Date().toISOString(),
    });

    const disburseRes = await disburseToDana({
      partnerReferenceNo: partnerRefNo,
      phoneNumber: phoneCheck.cleaned,
      amountIdr: cleanNet,
      sessionId: inquiry.sessionId,
      notes: `WD Setor Gmail #${wdId.slice(0, 8)}`,
    });

    const finishIso = new Date().toISOString();

    if (disburseRes.outcome === "SUCCESS") {
      await safeUpdateWithdrawal(wdId, {
        status: "berhasil",
        processed_at: finishIso,
        updated_at: finishIso,
        dana_partner_reference_no: partnerRefNo,
        dana_reference_no: disburseRes.referenceNo || null,
        dana_response_code: disburseRes.responseCode,
        dana_response_message: disburseRes.responseMessage,
        dana_checked_at: finishIso,
        admin_note: disburseRes.inconsistentFlag
          ? "Cair otomatis (4043818 Inconsistent Request — verifikasi di portal DANA)"
          : "Cair otomatis via DANA Disbursement",
      });

      await supabaseAdmin.from("transactions").insert({
        user_id: user.id,
        type: "withdrawal",
        amount: requestedAmount,
        title: "Penarikan Saldo DANA",
        description: `DANA ${phoneCheck.cleaned} a/n ${verifiedCustomerName}`,
        status: "success",
        reference_id: wdId,
      });

      await logAuditEvent({
        event: "WITHDRAWAL_STATUS_CHANGE",
        severity: "INFO",
        actorId: user.id,
        actorEmail: user.email,
        targetId: wdId,
        ip: clientIp,
        country,
        userAgent,
        details: {
          action: "AUTO_DISBURSE_SUCCESS",
          amount: requestedAmount,
          netAmount: cleanNet,
          partnerReferenceNo: partnerRefNo,
          referenceNo: disburseRes.referenceNo,
          responseCode: disburseRes.responseCode,
          customerName: verifiedCustomerName,
        },
      });

      return NextResponse.json({
        success: true,
        id: wdId,
        status: "berhasil",
        autoDisbursed: true,
        customerName: verifiedCustomerName,
        referenceNo: disburseRes.referenceNo,
        netAmount: cleanNet,
        taxFee: authoritativeTax,
      });
    }

    if (disburseRes.outcome === "MDA_INSUFFICIENT") {
      // 4033814: No funds left MDA; clear partnerRefNo so Admin approval can retry cleanly after MDA top-up
      await safeUpdateWithdrawal(wdId, {
        dana_partner_reference_no: null,
        dana_response_code: disburseRes.responseCode,
        dana_response_message: "Menunggu pengisian saldo MDA / persetujuan Admin",
        updated_at: finishIso,
      });

      await supabaseAdmin.from("transactions").insert({
        user_id: user.id,
        type: "withdrawal",
        amount: requestedAmount,
        title: "Penarikan Saldo DANA",
        description: `DANA ${phoneCheck.cleaned} a/n ${verifiedCustomerName}`,
        status: "pending",
        reference_id: wdId,
      });

      return NextResponse.json({
        success: true,
        id: wdId,
        status: "diproses",
        autoDisbursed: false,
        customerName: verifiedCustomerName,
        netAmount: cleanNet,
        taxFee: authoritativeTax,
      });
    }

    if (disburseRes.outcome === "PENDING_RECONCILE") {
      // Uncertain outcome (5003801 / 4293800 / timeout): MUST hold funds in `diproses` and keep partnerRefNo!
      await safeUpdateWithdrawal(wdId, {
        dana_partner_reference_no: partnerRefNo,
        dana_response_code: disburseRes.responseCode,
        dana_response_message: disburseRes.responseMessage,
        dana_checked_at: finishIso,
        updated_at: finishIso,
      });

      await supabaseAdmin.from("transactions").insert({
        user_id: user.id,
        type: "withdrawal",
        amount: requestedAmount,
        title: "Penarikan Saldo DANA",
        description: `DANA ${phoneCheck.cleaned} a/n ${verifiedCustomerName}`,
        status: "pending",
        reference_id: wdId,
      });

      return NextResponse.json({
        success: true,
        id: wdId,
        status: "diproses",
        autoDisbursed: false,
        pendingDanaConfirm: true,
        customerName: verifiedCustomerName,
        netAmount: cleanNet,
        taxFee: authoritativeTax,
      });
    }

    // Definitive failure (`DEF_FAILED`) -> Mark `ditolak` conditionally & atomically refund user's wallet
    const transitioned = await safeUpdateWithdrawal(
      wdId,
      {
        status: "ditolak",
        updated_at: finishIso,
        dana_partner_reference_no: partnerRefNo,
        dana_response_code: disburseRes.responseCode,
        dana_response_message: disburseRes.responseMessage,
        dana_checked_at: finishIso,
        admin_note: `Gagal cair otomatis DANA (${disburseRes.responseCode})`,
      },
      "diproses"
    );

    if (transitioned) {
      await atomicRefundWithdrawal({
        withdrawalId: wdId,
        userId: user.id,
        amount: requestedAmount,
      });
    }

    return NextResponse.json(
      {
        success: false,
        code: disburseRes.responseCode,
        error:
          disburseRes.friendlyError ||
          "Pencairan ke DANA ditolak oleh sistem DANA. Saldo Anda telah dikembalikan utuh.",
      },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(err, "Gagal memproses penarikan saldo.") },
      { status: 500 }
    );
  }
}
