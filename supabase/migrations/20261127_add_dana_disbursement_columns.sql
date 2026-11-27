-- ==============================================================================
-- Migration: Add DANA Disbursement to Balance tracking columns & webhook log
-- Date: 2026-11-27
-- ==============================================================================

-- 1. Add DANA reference & status tracking columns on public.withdrawals
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS dana_partner_reference_no character varying(64),
  ADD COLUMN IF NOT EXISTS dana_reference_no character varying(64),
  ADD COLUMN IF NOT EXISTS dana_response_code character varying(32),
  ADD COLUMN IF NOT EXISTS dana_response_message text,
  ADD COLUMN IF NOT EXISTS dana_checked_at timestamp with time zone;

-- Unique index on dana_partner_reference_no (idempotency key per DANA disbursement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_dana_partner_ref_unique
  ON public.withdrawals (dana_partner_reference_no)
  WHERE dana_partner_reference_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_dana_ref
  ON public.withdrawals (status, dana_partner_reference_no);

-- 2. Dedicated log table for verified DANA Finish-Notify webhooks (payment gateway events)
CREATE TABLE IF NOT EXISTS public.dana_webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  original_partner_reference_no character varying(128),
  original_reference_no character varying(128),
  merchant_id character varying(64),
  latest_transaction_status character varying(16),
  transaction_status_desc text,
  amount_value character varying(32),
  amount_currency character varying(8),
  raw_payload jsonb NOT NULL,
  verified_path text,
  received_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT dana_webhook_logs_pkey PRIMARY KEY (id)
);

ALTER TABLE public.dana_webhook_logs ENABLE ROW LEVEL SECURITY;
