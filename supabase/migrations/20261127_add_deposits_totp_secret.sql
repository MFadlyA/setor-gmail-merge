-- ==============================================================================
-- MIGRATION: Tambah kolom `totp_secret` pada tabel `public.deposits`
-- Jalankan script ini di Supabase SQL Editor (aman dijalankan berulang / idempotent)
-- ==============================================================================

-- 1. Tambahkan kolom `totp_secret` ke tabel `public.deposits`
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS totp_secret text;

-- 2. Pindahkan fallback 2FA yang tersimpan di kolom `note` ("2FA: ...") bila ada
UPDATE public.deposits
SET
  totp_secret = TRIM(SUBSTRING(note FROM '2FA:\s*([A-Za-z2-7\s-]+)')),
  note = NULLIF(TRIM(REGEXP_REPLACE(note, '\|?\s*2FA:\s*[A-Za-z2-7\s-]+', '', 'gi')), '')
WHERE totp_secret IS NULL
  AND note ~* '2FA:\s*[A-Za-z2-7]+';
