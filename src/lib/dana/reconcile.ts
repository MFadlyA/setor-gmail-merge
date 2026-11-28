import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDanaConfig } from "./client";
import { queryTopUpStatus } from "./disbursement";
import { atomicRefundWithdrawal } from "./refund";

export interface ReconcileSummaryResult {
  success: boolean;
  schemaMigrated: boolean;
  checkedCount: number;
  settledSuccessCount: number;
  refundedCount: number;
  stillPendingCount: number;
  results: Array<Record<string, unknown>>;
  message: string;
  error?: string;
}

/**
 * Checks whether the DANA tracking columns (`dana_partner_reference_no`, `dana_reference_no`, `dana_response_code`)
 * exist on `public.withdrawals` in Supabase.
 */
export async function checkDanaSchemaMigrated(): Promise<{
  migrated: boolean;
  recentVerifiedRows: Array<{
    id: string;
    amount: number;
    status: string;
    dana_reference_no: string | null;
    dana_response_code: string | null;
  }>;
}> {
  const { data, error } = await supabaseAdmin
    .from("withdrawals")
    .select("id, amount, status, dana_reference_no, dana_response_code")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error && /dana_/i.test(error.message || "")) {
    return { migrated: false, recentVerifiedRows: [] };
  }

  return {
    migrated: !error,
    recentVerifiedRows: (data || []).map((row) => ({
      id: String(row.id),
      amount: Number(row.amount) || 0,
      status: String(row.status || ""),
      dana_reference_no: row.dana_reference_no ? String(row.dana_reference_no) : null,
      dana_response_code: row.dana_response_code ? String(row.dana_response_code) : null,
    })),
  };
}

/**
 * Shared DANA Top-Up Status Reconciliation runner used by BOTH:
 * - Admin manual button (`POST /api/admin/dana/reconcile`)
 * - Cloudflare Cron Trigger (`POST /api/cron/dana-reconcile`, every 5 minutes)
 */
export async function runDanaReconciliation(options?: {
  targetId?: string;
  limit?: number;
}): Promise<ReconcileSummaryResult> {
  const cfg = getDanaConfig();
  if (!cfg.isConfigured) {
    return {
      success: false,
      schemaMigrated: true,
      checkedCount: 0,
      settledSuccessCount: 0,
      refundedCount: 0,
      stillPendingCount: 0,
      results: [],
      message: "Kredensial API DANA belum dikonfigurasi di server.",
      error: "Kredensial API DANA belum dikonfigurasi di server.",
    };
  }

  const targetId = options?.targetId?.trim() || "";
  const batchLimit = Math.min(50, Math.max(1, options?.limit ?? 25));

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
        .limit(batchLimit);

  if (fetchErr) {
    if (/dana_partner_reference_no/i.test(fetchErr.message || "")) {
      return {
        success: false,
        schemaMigrated: false,
        checkedCount: 0,
        settledSuccessCount: 0,
        refundedCount: 0,
        stillPendingCount: 0,
        results: [],
        message:
          "Kolom dana_partner_reference_no belum ada di tabel withdrawals. Jalankan migrasi SQL DANA di Supabase.",
        error:
          "Kolom dana_partner_reference_no belum ada di tabel withdrawals. Jalankan migrasi SQL DANA terlebih dahulu di Supabase.",
      };
    }
    throw fetchErr;
  }

  const rows = (candidates || []).filter(
    (r: Record<string, unknown>) =>
      ["diproses", "pending"].includes(String(r.status || "").toLowerCase()) &&
      typeof r.dana_partner_reference_no === "string" &&
      r.dana_partner_reference_no.trim().length > 0 &&
      // Skip rows still in the middle of an active HTTP disbursement (< 20s old with DISBURSING marker)
      !(
        (r.dana_response_code === "DISBURSING" || r.dana_response_code === "ADMIN_DISBURSING") &&
        typeof r.updated_at === "string" &&
        Date.now() - new Date(r.updated_at).getTime() < 20_000
      )
  );

  if (rows.length === 0) {
    return {
      success: true,
      schemaMigrated: true,
      checkedCount: 0,
      settledSuccessCount: 0,
      refundedCount: 0,
      stillPendingCount: 0,
      results: [],
      message: "Tidak ada penarikan DANA menggantung yang perlu direkonsiliasi.",
    };
  }

  let settledSuccessCount = 0;
  let refundedCount = 0;
  let stillPendingCount = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const wd of rows) {
    const wdId = String(wd.id);
    const partnerRef = String(wd.dana_partner_reference_no);
    const prevRefNo = typeof wd.dana_reference_no === "string" ? wd.dana_reference_no : undefined;
    const prevStatus = String(wd.status);

    const statusRes = await queryTopUpStatus(partnerRef, prevRefNo);
    const nowIso = new Date().toISOString();

    if (statusRes.mappedOutcome === "SUCCESS") {
      const { data: updated } = await supabaseAdmin
        .from("withdrawals")
        .update({
          status: "berhasil",
          processed_at: nowIso,
          updated_at: nowIso,
          dana_reference_no: statusRes.originalReferenceNo || prevRefNo || null,
          dana_response_code: `STATUS_${statusRes.latestTransactionStatus}`,
          dana_response_message: statusRes.transactionStatusDesc || "Success via Inquiry Status",
          dana_checked_at: nowIso,
          admin_note: "Diselesaikan via Rekonsiliasi Status DANA (00 Success)",
        })
        .eq("id", wdId)
        .eq("status", prevStatus)
        .select("id");

      if (updated && updated.length > 0) {
        await supabaseAdmin
          .from("transactions")
          .update({ status: "success" })
          .eq("reference_id", wdId)
          .eq("type", "withdrawal");
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
        .eq("id", wdId)
        .eq("status", prevStatus)
        .select("id");

      if (updated && updated.length > 0) {
        await supabaseAdmin
          .from("transactions")
          .update({ status: "failed" })
          .eq("reference_id", wdId)
          .eq("type", "withdrawal");

        await atomicRefundWithdrawal({
          withdrawalId: wdId,
          userId: String(wd.user_id),
          amount: Number(wd.amount) || 0,
        });
        refundedCount++;
      }
    } else {
      // PENDING (01/02/03), NOT_FOUND (07), or ERROR -> hold funds in `diproses`
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
        .eq("id", wdId);
      stillPendingCount++;
    }

    results.push({
      id: wdId,
      partnerReferenceNo: partnerRef,
      latestTransactionStatus: statusRes.latestTransactionStatus,
      mappedOutcome: statusRes.mappedOutcome,
      desc: statusRes.transactionStatusDesc,
    });
  }

  return {
    success: true,
    schemaMigrated: true,
    checkedCount: rows.length,
    settledSuccessCount,
    refundedCount,
    stillPendingCount,
    results,
    message: `Rekonsiliasi selesai: ${settledSuccessCount} Berhasil, ${refundedCount} Gagal & Refund, ${stillPendingCount} Masih Pending.`,
  };
}
