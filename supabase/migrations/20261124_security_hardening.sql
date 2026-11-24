-- ==============================================================================
-- SETOR GMAIL BY WINTER - OWASP TOP 10 & CLOUDFLARE SECURITY HARDENING PATCH
-- Jalankan script ini di Supabase SQL Editor.
-- Seluruh perintah bersifat idempotent & mengecek keberadaan tabel terlebih dahulu
-- (to_regclass) sehingga tidak akan gagal apabila ada tabel opsional yang dihapus.
-- ==============================================================================

-- 1. Pastikan kategori 'good' dan 'bebas' tersedia (jika tabel setor_categories ada)
DO $$
BEGIN
  IF to_regclass('public.setor_categories') IS NOT NULL THEN
    INSERT INTO public.setor_categories (id, label, price, description, badge, is_active)
    VALUES
      ('good', 'Gmail Fresh', 1500, 'Akun Gmail Fresh baru dibuat sesuai rules standar', 'Rekomendasi', true),
      ('bebas', 'Gmail Lama', 1000, 'Setor akun Gmail lama yang sudah ada beserta password', 'Fleksibel', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 2. Perketat fungsi public.is_admin() dengan search_path eksplisit (CWE-426)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = auth.uid()
      AND (
        LOWER(u.email) = 'komangabiw@gmail.com'
        OR LOWER(COALESCE(p.role, '')) = 'admin'
      )
  );
$$;

-- 3. Trigger proteksi kolom sensitif pada public.profiles (Cegah Self-Promotion ke Admin)
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  -- Izinkan operasi internal database trigger (auth.uid() IS NULL) & service_role
  IF v_jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    IF auth.uid() IS NULL OR v_jwt_role = 'service_role' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Izinkan admin terverifikasi
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'Akses ditolak: Tidak dapat membuat profil untuk pengguna lain.';
    END IF;
    NEW.role := 'User';
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Akses ditolak: ID profil tidak dapat diubah.';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Akses ditolak: Email profil tidak dapat diubah secara langsung.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin untuk mengubah role akun.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
    CREATE TRIGGER trg_protect_profile_privileged_fields
      BEFORE INSERT OR UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.protect_profile_privileged_fields();
  END IF;
END $$;

-- 4. Aktifkan RLS & Kebijakan Keamanan pada Seluruh Tabel Aktif (Aman dengan to_regclass)
DO $$
DECLARE
  v_tbl text;
BEGIN
  -- Aktifkan RLS otomatis hanya untuk tabel yang benar-benar ada di database produksi
  FOREACH v_tbl IN ARRAY ARRAY[
    'profiles',
    'wallets',
    'saved_ewallets',
    'deposits',
    'deposit_batches',
    'withdrawals',
    'transactions',
    'setor_categories',
    'app_settings',
    'email_checker_logs',
    'referral_missions',
    'referrals',
    'bonus_history'
  ]
  LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
    END IF;
  END LOOP;

  -- 5. Profiles
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
    CREATE POLICY "profiles_select_own" ON public.profiles
      FOR SELECT USING (auth.uid() = id OR public.is_admin());

    DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
    CREATE POLICY "profiles_insert_own" ON public.profiles
      FOR INSERT WITH CHECK ((auth.uid() = id AND role = 'User') OR public.is_admin());

    DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
    CREATE POLICY "profiles_update_own" ON public.profiles
      FOR UPDATE
      USING (auth.uid() = id OR public.is_admin())
      WITH CHECK (auth.uid() = id OR public.is_admin());
  END IF;

  -- 6. Wallets (HAPUS akses tulis langsung klien — cegah manipulasi saldo bebas)
  IF to_regclass('public.wallets') IS NOT NULL THEN
    DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
    CREATE POLICY "wallets_select_own" ON public.wallets
      FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

    DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;
    DROP POLICY IF EXISTS "wallets_admin_all" ON public.wallets;
    CREATE POLICY "wallets_admin_all" ON public.wallets
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  -- 7. Saved E-Wallets
  IF to_regclass('public.saved_ewallets') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ewallets_all_own" ON public.saved_ewallets;
    CREATE POLICY "ewallets_all_own" ON public.saved_ewallets
      FOR ALL
      USING (auth.uid() = user_id OR public.is_admin())
      WITH CHECK (auth.uid() = user_id OR public.is_admin());
  END IF;

  -- 8. Deposits (Mutasi wajib via API Server /api/user/deposits atau Admin)
  IF to_regclass('public.deposits') IS NOT NULL THEN
    DROP POLICY IF EXISTS "deposits_select_own" ON public.deposits;
    CREATE POLICY "deposits_select_own" ON public.deposits
      FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

    DROP POLICY IF EXISTS "deposits_insert_own" ON public.deposits;
    DROP POLICY IF EXISTS "deposits_admin_write" ON public.deposits;
    CREATE POLICY "deposits_admin_write" ON public.deposits
      FOR INSERT WITH CHECK (public.is_admin());

    DROP POLICY IF EXISTS "deposits_update_admin" ON public.deposits;
    CREATE POLICY "deposits_update_admin" ON public.deposits
      FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

    ALTER TABLE public.deposits DROP CONSTRAINT IF EXISTS deposits_status_check;
    ALTER TABLE public.deposits ADD CONSTRAINT deposits_status_check
      CHECK (status::text = ANY (ARRAY['pending', 'dicek', 'diterima', 'ditolak', 'accepted', 'rejected']::text[]));

    CREATE INDEX IF NOT EXISTS idx_deposits_normalized_lower ON public.deposits (LOWER(normalized_gmail));
  END IF;

  -- 9. Withdrawals (Mutasi wajib via API Server /api/user/withdrawals atau Admin)
  IF to_regclass('public.withdrawals') IS NOT NULL THEN
    DROP POLICY IF EXISTS "withdrawals_select_own" ON public.withdrawals;
    CREATE POLICY "withdrawals_select_own" ON public.withdrawals
      FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

    DROP POLICY IF EXISTS "withdrawals_insert_own" ON public.withdrawals;
    DROP POLICY IF EXISTS "withdrawals_admin_insert" ON public.withdrawals;
    CREATE POLICY "withdrawals_admin_insert" ON public.withdrawals
      FOR INSERT WITH CHECK (public.is_admin());

    DROP POLICY IF EXISTS "withdrawals_update_admin" ON public.withdrawals;
    CREATE POLICY "withdrawals_update_admin" ON public.withdrawals
      FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

    ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
    ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check
      CHECK (status::text = ANY (ARRAY['diproses', 'berhasil', 'ditolak', 'pending', 'success', 'failed', 'rejected']::text[]));
  END IF;

  -- 10. Transactions (Mutasi wajib via API Server atau Admin)
  IF to_regclass('public.transactions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
    CREATE POLICY "transactions_select_own" ON public.transactions
      FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

    DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
    DROP POLICY IF EXISTS "transactions_admin_all" ON public.transactions;
    CREATE POLICY "transactions_admin_all" ON public.transactions
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  -- 11. Setor Categories & App Settings
  IF to_regclass('public.setor_categories') IS NOT NULL THEN
    DROP POLICY IF EXISTS "categories_read_all" ON public.setor_categories;
    CREATE POLICY "categories_read_all" ON public.setor_categories FOR SELECT USING (true);

    DROP POLICY IF EXISTS "categories_admin_all" ON public.setor_categories;
    CREATE POLICY "categories_admin_all" ON public.setor_categories
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.app_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
    CREATE POLICY "app_settings_read_all" ON public.app_settings FOR SELECT USING (true);

    DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;
    CREATE POLICY "app_settings_admin_all" ON public.app_settings
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  -- 12. Tabel opsional lainnya (hanya dieksekusi jika tabelnya masih ada di database)
  IF to_regclass('public.deposit_batches') IS NOT NULL THEN
    DROP POLICY IF EXISTS "deposit_batches_select_own" ON public.deposit_batches;
    CREATE POLICY "deposit_batches_select_own" ON public.deposit_batches
      FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
  END IF;

  IF to_regclass('public.email_checker_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "checker_logs_select_own" ON public.email_checker_logs;
    CREATE POLICY "checker_logs_select_own" ON public.email_checker_logs
      FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
  END IF;

  IF to_regclass('public.referral_missions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "referral_missions_read_all" ON public.referral_missions;
    CREATE POLICY "referral_missions_read_all" ON public.referral_missions FOR SELECT USING (true);

    DROP POLICY IF EXISTS "referral_missions_admin_all" ON public.referral_missions;
    CREATE POLICY "referral_missions_admin_all" ON public.referral_missions
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.referrals') IS NOT NULL THEN
    DROP POLICY IF EXISTS "referrals_select_own" ON public.referrals;
    CREATE POLICY "referrals_select_own" ON public.referrals
      FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id OR public.is_admin());
  END IF;

  IF to_regclass('public.bonus_history') IS NOT NULL THEN
    DROP POLICY IF EXISTS "bonus_history_select_own" ON public.bonus_history;
    CREATE POLICY "bonus_history_select_own" ON public.bonus_history
      FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
  END IF;
END $$;
