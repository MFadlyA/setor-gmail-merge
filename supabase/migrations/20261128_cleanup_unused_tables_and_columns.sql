-- ============================================================================
-- Migration: Cleanup Unused Tables and Columns (Post-Deploy Only!)
-- Date: 2026-11-28
-- WARNING: Run this in Supabase SQL Editor ONLY AFTER Cloudflare Workers
--          has finished deploying the updated application code.
-- ============================================================================

DROP TABLE IF EXISTS public.saved_ewallets;

ALTER TABLE public.withdrawals
  DROP COLUMN IF EXISTS proof_url;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS password_changed_at;
