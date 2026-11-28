import { supabaseAdmin } from "@/lib/supabase/admin";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AtomicRefundParams {
  withdrawalId: string;
  userId: string;
  amount: number;
  /**
   * Whether to record a `type = "refund"` row in `public.transactions`.
   * Defaults to `true` (used when a pending/queued withdrawal is rejected or fails reconciliation).
   * Pass `false` only if no withdrawal ledger row was created yet and you still want idempotency via CAS.
   */
  recordLedgerRow?: boolean;
}

/**
 * Refunds a user's wallet balance atomically and idempotently:
 * 1. Prefers the database-level `public.refund_withdrawal_atomic` RPC (single PostgreSQL transaction
 *    with partial unique index `idx_transactions_unique_refund_per_wd` + in-place `balance = balance + p_amount`).
 * 2. Falls back to an idempotency check + Compare-And-Swap (`eq("balance", prevBal)`) loop if the SQL
 *    function has not yet been applied in Supabase, preventing double-refunds on rapid double-clicks
 *    or concurrent balance updates.
 */
export async function atomicRefundWithdrawal(
  params: AtomicRefundParams
): Promise<{ refunded: boolean; usedRpc: boolean }> {
  const cleanAmount = Math.floor(Number(params.amount) || 0);
  if (!params.withdrawalId || !params.userId || cleanAmount <= 0) {
    return { refunded: false, usedRpc: false };
  }

  const recordLedger = params.recordLedgerRow !== false;

  // Path 1: Database-level atomic RPC (when `recordLedger === true`)
  if (recordLedger) {
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
      "refund_withdrawal_atomic",
      {
        p_withdrawal_id: params.withdrawalId,
        p_user_id: params.userId,
        p_amount: cleanAmount,
        p_description: "Refund penarikan",
      }
    );

    if (!rpcErr && typeof rpcResult === "boolean") {
      return { refunded: rpcResult, usedRpc: true };
    }
  }

  // Path 2: Fallback Compare-And-Swap (CAS) loop + idempotency guard
  if (recordLedger) {
    const { data: existingRefund } = await supabaseAdmin
      .from("transactions")
      .select("id")
      .eq("user_id", params.userId)
      .eq("type", "refund")
      .eq("reference_id", params.withdrawalId)
      .limit(1);

    if (existingRefund && existingRefund.length > 0) {
      return { refunded: false, usedRpc: false };
    }
  }

  const maxCasAttempts = 6;
  let casSucceeded = false;

  for (let attempt = 1; attempt <= maxCasAttempts; attempt++) {
    const { data: wallet, error: fetchErr } = await supabaseAdmin
      .from("wallets")
      .select("balance, total_withdrawn")
      .eq("user_id", params.userId)
      .maybeSingle();

    if (fetchErr || !wallet) {
      break;
    }

    const prevBalance = Number(wallet.balance) || 0;
    const prevWithdrawn = Number(wallet.total_withdrawn) || 0;
    const nextBalance = prevBalance + cleanAmount;
    const nextWithdrawn = Math.max(0, prevWithdrawn - cleanAmount);

    const { data: updatedRows, error: updateErr } = await supabaseAdmin
      .from("wallets")
      .update({
        balance: nextBalance,
        total_withdrawn: nextWithdrawn,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", params.userId)
      .eq("balance", prevBalance)
      .eq("total_withdrawn", prevWithdrawn)
      .select("balance");

    if (!updateErr && updatedRows && updatedRows.length > 0) {
      casSucceeded = true;
      break;
    }

    if (attempt < maxCasAttempts) {
      await sleep(40 * attempt + Math.floor(Math.random() * 40));
    }
  }

  if (!casSucceeded) {
    throw new Error("Gagal mengembalikan saldo secara atomik karena konflik pembaruan dompet.");
  }

  if (recordLedger) {
    const { error: txInsertErr } = await supabaseAdmin.from("transactions").insert({
      user_id: params.userId,
      type: "refund",
      amount: cleanAmount,
      title: "Pengembalian Dana Penarikan",
      description: "Refund penarikan",
      status: "success",
      reference_id: params.withdrawalId,
    });

    if (txInsertErr && /reference_id/i.test(txInsertErr.message || "")) {
      await supabaseAdmin.from("transactions").insert({
        user_id: params.userId,
        type: "refund",
        amount: cleanAmount,
        title: "Pengembalian Dana Penarikan",
        description: "Refund penarikan",
        status: "success",
      });
    }
  }

  return { refunded: true, usedRpc: false };
}
