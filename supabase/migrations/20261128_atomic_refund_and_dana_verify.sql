-- ============================================================================
-- Migration: Atomic Withdrawal Refund + DANA Columns Verification & Backfill
-- Date: 2026-11-28
-- Safe to run multiple times (100% idempotent)
-- ============================================================================

-- 1. Ensure DANA Disbursement tracking columns exist on `public.withdrawals`
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS dana_partner_reference_no text,
  ADD COLUMN IF NOT EXISTS dana_reference_no text,
  ADD COLUMN IF NOT EXISTS dana_response_code text,
  ADD COLUMN IF NOT EXISTS dana_response_message text,
  ADD COLUMN IF NOT EXISTS dana_checked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_dana_partner_ref_unique
  ON public.withdrawals (dana_partner_reference_no)
  WHERE dana_partner_reference_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_dana_pending
  ON public.withdrawals (status, created_at)
  WHERE status = 'diproses' AND dana_partner_reference_no IS NOT NULL;

-- 2. Backfill the 3 verified Sandbox DANA withdrawals (10k, 15k, 20k) if migration
--    was not yet applied when they ran (values verified from Worker Audit Logs)
UPDATE public.withdrawals
SET
  dana_partner_reference_no = COALESCE(dana_partner_reference_no, 'WD-63b343a0836b44fdbb6b2ed6-MX03ZGO2'),
  dana_reference_no         = COALESCE(dana_reference_no, '2026112810121481030100166894102357805'),
  dana_response_code        = COALESCE(dana_response_code, '2003800'),
  dana_response_message     = COALESCE(dana_response_message, 'Successful'),
  dana_checked_at           = COALESCE(dana_checked_at, updated_at, created_at)
WHERE id = '63b343a0-836b-44fd-bb6b-2ed671348a5f';

UPDATE public.withdrawals
SET
  dana_partner_reference_no = COALESCE(dana_partner_reference_no, 'WD-503da588b5ed461b84524711-MX0421NC'),
  dana_reference_no         = COALESCE(dana_reference_no, '2026112810121481030100166894102357806'),
  dana_response_code        = COALESCE(dana_response_code, '2003800'),
  dana_response_message     = COALESCE(dana_response_message, 'Successful'),
  dana_checked_at           = COALESCE(dana_checked_at, updated_at, created_at)
WHERE id = '503da588-b5ed-461b-8452-47114e493d79';

UPDATE public.withdrawals
SET
  dana_partner_reference_no = COALESCE(dana_partner_reference_no, 'WD-9fa3483819c14df0a19dd5c8-MX04QGGL'),
  dana_reference_no         = COALESCE(dana_reference_no, '2026112810121481030100166894102357807'),
  dana_response_code        = COALESCE(dana_response_code, '2003800'),
  dana_response_message     = COALESCE(dana_response_message, 'Successful'),
  dana_checked_at           = COALESCE(dana_checked_at, updated_at, created_at)
WHERE id = '9fa34838-19c1-4df0-a19d-d5c8e9da3f3f';

-- 3. Prevent duplicate refund ledger entries per withdrawal at the DB level
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reference_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_refund_per_wd
  ON public.transactions (reference_id)
  WHERE type = 'refund' AND reference_id IS NOT NULL;

-- Clean up existing verbose refund descriptions if present
UPDATE public.transactions
SET description = 'Refund penarikan'
WHERE type = 'refund'
  AND description LIKE 'Refund %';

-- 4. Atomic single-transaction Postgres RPC for withdrawal balance refund
CREATE OR REPLACE FUNCTION public.refund_withdrawal_atomic(
  p_withdrawal_id uuid,
  p_user_id uuid,
  p_amount bigint,
  p_description text DEFAULT 'Refund penarikan'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN false;
  END IF;

  -- Idempotency lock: insert the unique refund ledger row first.
  -- If a refund row for `p_withdrawal_id` already exists, DO NOTHING and exit without double-crediting!
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    title,
    description,
    status,
    reference_id
  )
  VALUES (
    p_user_id,
    'refund',
    p_amount,
    'Pengembalian Dana Penarikan',
    COALESCE(NULLIF(BTRIM(p_description), ''), 'Refund penarikan'),
    'success',
    p_withdrawal_id
  )
  ON CONFLICT (reference_id) WHERE type = 'refund' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    -- Already refunded earlier; safely skip wallet increment
    RETURN false;
  END IF;

  -- Atomic in-place SQL increment (no read-then-write race condition)
  UPDATE public.wallets
  SET
    balance = COALESCE(balance, 0) + p_amount,
    total_withdrawn = GREATEST(0, COALESCE(total_withdrawn, 0) - p_amount),
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_withdrawal_atomic(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_withdrawal_atomic(uuid, uuid, bigint, text) TO service_role;
