-- ==============================================================================
-- MIGRATION: Tambah kolom `password` pada tabel `public.deposits`
-- Jalankan script ini di Supabase SQL Editor (aman dijalankan berulang / idempotent)
-- ==============================================================================

-- 1. Tambahkan kolom `password` ke tabel `public.deposits`
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS password text;

-- 2. Pindahkan password lama yang sebelumnya tersimpan di kolom `note` ("Password: ...")
UPDATE public.deposits
SET
  password = TRIM(SUBSTRING(note FROM '^Password:\s*(.+)$')),
  note = NULL
WHERE password IS NULL
  AND note ~ '^Password:\s*.+';

-- 3. Isi password default CMS (fallback 'winter1212') untuk setoran Gmail Fresh ('good') lama
DO $$
DECLARE
  v_default_pw text := 'winter1212';
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM((value::jsonb ->> 'default_password')), ''), 'winter1212')
    INTO v_default_pw
    FROM public.app_settings
    WHERE key = 'site_config'
    LIMIT 1;
  END IF;

  UPDATE public.deposits
  SET password = COALESCE(v_default_pw, 'winter1212')
  WHERE password IS NULL
    AND category_id = 'good';
END $$;
