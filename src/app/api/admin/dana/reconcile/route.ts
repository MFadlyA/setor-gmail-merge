import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminAuth } from "@/lib/security/auth-guard";
import { sanitizeString } from "@/lib/security/sanitize";
import { logAuditEvent } from "@/lib/security/audit-logger";
import { getDanaConfig } from "@/lib/dana/client";
import {
  AUTO_DISBURSE_MAX_AMOUNT,
  checkMdaBalance,
  queryTopUpStatus,
} from "@/lib/dana/disbursement";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dana/reconcile
 * Returns live DANA Merchant Disbursement Account (MDA) balance, environment status,
 * and count of `diproses` withdrawals awaiting DANA status reconciliation.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const cfg = getDanaConfig();
    const mda = await checkMdaBalance();

    let pendingReconcileCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "diproses")
        .not("dana_partner_reference_no", "is", null);
      pendingReconcileCount = count || 0;
    } catch {
      // Ignore if migration column not yet added
    }

    return NextResponse.json({
      success: true,
      config: {
        env: cfg.env,
        isConfigured: cfg.isConfigured,
        hasMerchantId: Boolean(cfg.merchantId),
        autoDisburseMaxAmount: AUTO_DISBURSE_MAX_AMOUNT,
      },
      mda,
      pendingReconcileCount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal memuat informasi saldo MDA DANA" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/dana/reconcile
 * Checks `transferToDanaInquiryStatus` (`serviceCode: "38"`) on `diproses` DANA withdrawals
 * that already have a `dana_partner_reference_no` and finalizes `berhasil` or `ditolak` (+ atomic refund).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const cfg = getDanaConfig();
    if (!cfg.isConfigured) {
      return NextResponse.json(
        { success: false, error: "Kredensial API DANA belum dikonfigurasi di server." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetId = body?.withdrawalId ? sanitizeString(body.withdrawalId, 100) : "";

    const { data: candidates, error: fetchErr } = targetId
      ? await supabaseAdmin
          .from("withdrawals")
          .select("*")
          .eq("id", targetId)
          .limit(1)
      : await supabaseAdmin
          .from("withdrawals")
          .select("*")
          .eq("status", "diproses")
          .not("dana_partner_reference_no", "is", null)
          .order("created_at", { ascending: true })
          .limit(25);
    if (fetchErr) {
      if (/dana_partner_reference_no/i.test(fetchErr.message || "")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Kolom dana_partner_reference_no belum ada di tabel withdrawals. Jalankan migrasi SQL DANA terlebih dahulu di Supabase.",
          },
          { status: 400 }
        );
      }
      throw fetchErr;
    }

    const rows = (candidates || []).filter(
      (r: any) =>
        ["diproses", "pending"].includes(String(r.status || "").toLowerCase()) &&
        typeof r.dana_partner_reference_no === "string" &&
        r.dana_partner_reference_no.trim().length > 0
    );

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        checkedCount: 0,
        settledSuccessCount: 0,
        refundedCount: 0,
        stillPendingCount: 0,
        message: "Tidak ada penarikan DANA menggantung yang perlu direkonsiliasi.",
      });
    }

    let settledSuccessCount = 0;
    let refundedCount = 0;
    let stillPendingCount = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const wd of rows) {
      const statusRes = await queryTopUpStatus(
        wd.dana_partner_reference_no,
        wd.dana_reference_no || undefined
      );
      const nowIso = new Date().toISOString();

      if (statusRes.mappedOutcome === "SUCCESS") {
        const { data: updated } = await supabaseAdmin
          .from("withdrawals")
          .update({
            status: "berhasil",
            processed_at: nowIso,
            updated_at: nowIso,
            dana_reference_no: statusRes.originalReferenceNo || wd.dana_reference_no || null,
            dana_response_code: `STATUS_${statusRes.latestTransactionStatus}`,
            dana_response_message: statusRes.transactionStatusDesc || "Success via Inquiry Status",
            dana_checked_at: nowIso,
            admin_note: "Diselesaikan via Rekonsiliasi Status DANA (00 Success)",
          })
          .eq("id", wd.id)
          .eq("status", wd.status)
          .select("id");

        if (updated && updated.length > 0) {
          await supabaseAdmin
            .from("transactions")
            .update({ status: "success" })
            .eq("reference_id", wd.id);
          settledSuccessCount++;
        }
      } else if (statusRes.mappedOutcome === "FAILED") {
        const { data: updated } = await supabaseAdmin
          .from("withdrawals")
          .update({
            status: "ditolak",
            updated_at: nowIso,
            dana_response_code: `STATUS_${statusRes.latestTransactionStatus}`,
            dana_response_message: statusRes.transactionStatusDesc || "Failed/Cancelled di DANA",
            dana_checked_at: nowIso,
            admin_note: `Gagal di DANA (${statusRes.latestTransactionStatus}: ${statusRes.transactionStatusDesc}) — Saldo dikembalikan`,
          })
          .eq("id", wd.id)
          .eq("status", wd.status)
          .select("id");

        if (updated && updated.length > 0) {
          await supabaseAdmin
            .from("transactions")
            .update({ status: "failed" })
            .eq("reference_id", wd.id);

          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("balance, total_withdrawn")
            .eq("user_id", wd.user_id)
            .maybeSingle();

          if (wallet) {
            await supabaseAdmin
              .from("wallets")
              .update({
                balance: Number(wallet.balance) + Number(wd.amount),
                total_withdrawn: Math.max(0, Number(wallet.total_withdrawn) - Number(wd.amount)),
                updated_at: nowIso,
              })
              .eq("user_id", wd.user_id);

            await supabaseAdmin.from("transactions").insert({
              user_id: wd.user_id,
              type: "refund",
              amount: wd.amount,
              title: "Pengembalian Dana Penarikan",
              description: `Refund otomatis rekonsiliasi DANA #${String(wd.id).slice(0, 8)} (${statusRes.transactionStatusDesc})`,
              status: "success",
            });
          }
          refundedCount++;
        }
      } else {
        // PENDING (01/02/03), NOT_FOUND (07), or ERROR -> keep `diproses`, record latest check timestamp
        await supabaseAdmin
          .from("withdrawals")
          .update({
            dana_response_code: statusRes.latestTransactionStatus
              ? `STATUS_${statusRes.latestTransactionStatus}`
              : statusRes.responseCode,
            dana_response_message: statusRes.transactionStatusDesc || statusRes.responseMessage,
            dana_checked_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", wd.id);
        stillPendingCount++;
      }

      results.push({
        id: wd.id,
        partnerReferenceNo: wd.dana_partner_reference_no,
        latestTransactionStatus: statusRes.latestTransactionStatus,
        mappedOutcome: statusRes.mappedOutcome,
        desc: statusRes.transactionStatusDesc,
      });
    }

    await logAuditEvent({
      event: "WITHDRAWAL_STATUS_CHANGE",
      severity: "INFO",
      actorId: auth.user?.id,
      actorEmail: auth.user?.email,
      ip: auth.clientIp,
      country: auth.country,
      details: {
        action: "ADMIN_DANA_RECONCILE",
        checkedCount: rows.length,
        settledSuccessCount,
        refundedCount,
        stillPendingCount,
      },
    });

    return NextResponse.json({
      success: true,
      checkedCount: rows.length,
      settledSuccessCount,
      refundedCount,
      stillPendingCount,
      results,
      message: `Rekonsiliasi selesai: ${settledSuccessCount} Berhasil, ${refundedCount} Gagal & Refund, ${stillPendingCount} Masih Pending.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal menjalankan rekonsiliasi DANA" },
      { status: 500 }
    );
  }
}
