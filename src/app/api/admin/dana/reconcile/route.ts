import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminAuth } from "@/lib/security/auth-guard";
import { sanitizeString } from "@/lib/security/sanitize";
import { logAuditEvent } from "@/lib/security/audit-logger";
import { getDanaConfig } from "@/lib/dana/client";
import {
  AUTO_DISBURSE_MAX_AMOUNT,
  checkMdaBalance,
} from "@/lib/dana/disbursement";
import {
  checkDanaSchemaMigrated,
  runDanaReconciliation,
} from "@/lib/dana/reconcile";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dana/reconcile
 * Returns live DANA Merchant Disbursement Account (MDA) balance, environment status,
 * migration verification state (`schemaMigrated`), and count of `diproses` withdrawals
 * awaiting DANA status reconciliation.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const cfg = getDanaConfig();
    const [mda, schemaStatus] = await Promise.all([
      checkMdaBalance(),
      checkDanaSchemaMigrated(),
    ]);

    let pendingReconcileCount = 0;
    if (schemaStatus.migrated) {
      const { count } = await supabaseAdmin
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "diproses")
        .not("dana_partner_reference_no", "is", null);
      pendingReconcileCount = count || 0;
    }

    return NextResponse.json({
      success: true,
      config: {
        env: cfg.env,
        isConfigured: cfg.isConfigured,
        hasMerchantId: Boolean(cfg.merchantId),
        autoDisburseMaxAmount: AUTO_DISBURSE_MAX_AMOUNT,
        schemaMigrated: schemaStatus.migrated,
      },
      mda,
      pendingReconcileCount,
      recentVerifiedRows: schemaStatus.recentVerifiedRows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat informasi saldo MDA DANA";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
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
    const body = await req.json().catch(() => ({}));
    const targetId = body?.withdrawalId ? sanitizeString(body.withdrawalId, 100) : "";

    const summary = await runDanaReconciliation({ targetId, limit: 25 });
    if (!summary.success) {
      return NextResponse.json(
        { success: false, error: summary.error || summary.message },
        { status: summary.schemaMigrated ? 503 : 400 }
      );
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
        checkedCount: summary.checkedCount,
        settledSuccessCount: summary.settledSuccessCount,
        refundedCount: summary.refundedCount,
        stillPendingCount: summary.stillPendingCount,
      },
    });

    return NextResponse.json(summary);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menjalankan rekonsiliasi DANA";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
