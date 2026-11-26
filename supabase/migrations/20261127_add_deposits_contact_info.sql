-- Migration: Add contact_info column to deposits for user Telegram / WhatsApp follow-up
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS contact_info text;

-- Backfill contact_info from legacy note fallback ("Kontak: ...") if present
UPDATE public.deposits
SET contact_info = trim(substring(note FROM 'Kontak:\s*([^|]+)'))
WHERE contact_info IS NULL
  AND note ~* 'Kontak:\s*[^|]+';
