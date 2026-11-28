-- ==============================================================================
-- SETOR GMAIL BY WINTER - COMPLETE DATABASE SCHEMA & SECURITY (SUPABASE)
-- Last Update: Optimized with RLS, Admin Policies, Constraints & Performance Index
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. TABEL: PROFILES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  role character varying NOT NULL DEFAULT 'User'::character varying CHECK (role::text = ANY (ARRAY['User'::character varying, 'Admin'::character varying, 'Reseller'::character varying]::text[])),
  avatar_url text,
  whatsapp_channel_url text DEFAULT 'https://www.whatsapp.com/channel/0029VbEImqX7j6gFzKU9Qy1Y'::text,
  dana_number character varying,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------------
-- 3. TABEL: WALLETS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned bigint NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  total_withdrawn bigint NOT NULL DEFAULT 0 CHECK (total_withdrawn >= 0),
  minimum_withdrawal bigint NOT NULL DEFAULT 5000 CHECK (minimum_withdrawal > 0),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT wallets_pkey PRIMARY KEY (id),
  CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------------
-- 4. TABEL: SETOR CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.setor_categories (
  id character varying NOT NULL,
  label character varying NOT NULL,
  price integer NOT NULL DEFAULT 4500,
  description text,
  badge character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT setor_categories_pkey PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------------
-- 6. TABEL: DEPOSIT BATCHES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deposit_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id character varying NOT NULL,
  total_submitted integer NOT NULL DEFAULT 0,
  total_accepted integer NOT NULL DEFAULT 0,
  total_rejected integer NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT deposit_batches_pkey PRIMARY KEY (id),
  CONSTRAINT deposit_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT deposit_batches_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.setor_categories(id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------------------------
-- 7. TABEL: DEPOSITS (SETORAN GMAIL)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid,
  gmail character varying NOT NULL,
  normalized_gmail character varying NOT NULL,
  password text,
  category_id character varying NOT NULL DEFAULT 'good'::character varying,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'dicek'::character varying, 'diterima'::character varying, 'ditolak'::character varying]::text[])),
  amount integer NOT NULL DEFAULT 1500,
  note text,
  checked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT deposits_pkey PRIMARY KEY (id),
  CONSTRAINT deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT deposits_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.deposit_batches(id) ON DELETE SET NULL,
  CONSTRAINT deposits_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.setor_categories(id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------------------------
-- 8. TABEL: WITHDRAWALS (PENARIKAN SALDO)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  tax_fee integer NOT NULL DEFAULT 0 CHECK (tax_fee >= 0),
  net_amount bigint NOT NULL CHECK (net_amount >= 0),
  method character varying NOT NULL CHECK (method::text = ANY (ARRAY['DANA'::character varying, 'OVO'::character varying, 'GOPAY'::character varying, 'SHOPEEPAY'::character varying]::text[])),
  account_number character varying NOT NULL,
  account_name character varying,
  status character varying NOT NULL DEFAULT 'diproses'::character varying CHECK (status::text = ANY (ARRAY['diproses'::character varying, 'berhasil'::character varying, 'ditolak'::character varying]::text[])),
  dana_partner_reference_no character varying(64) UNIQUE,
  dana_reference_no character varying(64),
  dana_response_code character varying(32),
  dana_response_message text,
  dana_checked_at timestamp with time zone,
  admin_note text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT withdrawals_pkey PRIMARY KEY (id),
  CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------------
-- 9. TABEL: TRANSACTIONS (MUTASI SALDO)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['deposit'::character varying, 'withdrawal'::character varying, 'bonus'::character varying, 'refund'::character varying, 'adjustment'::character varying]::text[])),
  amount bigint NOT NULL,
  title character varying NOT NULL,
  description text,
  status character varying NOT NULL DEFAULT 'success'::character varying CHECK (status::text = ANY (ARRAY['success'::character varying, 'pending'::character varying, 'failed'::character varying]::text[])),
  reference_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------------
-- 10. TABEL: EMAIL CHECKER LOGS & APP SETTINGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_checker_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  email character varying NOT NULL,
  status character varying NOT NULL CHECK (status::text = ANY (ARRAY['live'::character varying, 'die'::character varying, 'invalid'::character varying]::text[])),
  message text,
  source character varying DEFAULT 'checker_tab'::character varying CHECK (source::text = ANY (ARRAY['checker_tab'::character varying, 'setor_validation'::character varying, 'api'::character varying]::text[])),
  checked_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT email_checker_logs_pkey PRIMARY KEY (id),
  CONSTRAINT email_checker_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key character varying NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT app_settings_pkey PRIMARY KEY (key)
);

-- ------------------------------------------------------------------------------
-- 12. TABEL: REFERRAL MISSIONS, REFERRALS & BONUS HISTORY (OPTIONAL SUPPORT)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_missions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  headline character varying NOT NULL DEFAULT 'MISI REFERRAL'::character varying,
  title character varying NOT NULL DEFAULT 'Undang 10 teman & dapatkan Rp10.000'::character varying,
  target_count integer NOT NULL DEFAULT 10,
  reward_amount bigint NOT NULL DEFAULT 10000,
  requirement text DEFAULT 'Syarat: Teman melakukan setor Gmail pertama yang diterima.'::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT referral_missions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL,
  status character varying NOT NULL DEFAULT 'menunggu'::character varying CHECK (status::text = ANY (ARRAY['menunggu'::character varying, 'berhasil'::character varying]::text[])),
  reward_amount integer NOT NULL DEFAULT 1000,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT referrals_pkey PRIMARY KEY (id),
  CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT referrals_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.bonus_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label character varying NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  mission_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT bonus_history_pkey PRIMARY KEY (id),
  CONSTRAINT bonus_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT bonus_history_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.referral_missions(id) ON DELETE SET NULL
);

-- ==============================================================================
-- 13. INDEXING UNTUK KECEPATAN QUERY
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_deposits_user_created ON public.deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_normalized_gmail ON public.deposits(normalized_gmail);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON public.withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON public.transactions(user_id, created_at DESC);

-- ==============================================================================
-- 14. TRIGGER: AUTO CREATE PROFILE & WALLET SAAT REGISTER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'Pengguna'
  );

  INSERT INTO public.profiles (id, name, email)
  VALUES (new.id, v_name, new.email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id, balance, minimum_withdrawal)
  VALUES (new.id, 0, 5000)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- 15. HELPER & ROW LEVEL SECURITY (RLS) POLICIES (HARDENED - OWASP A01/A04)
-- ==============================================================================
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

-- Trigger proteksi kolom sensitif pada public.profiles (Cegah Self-Promotion ke Admin)
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF v_jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    IF auth.uid() IS NULL OR v_jwt_role = 'service_role' THEN
      RETURN NEW;
    END IF;
  END IF;

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

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_fields();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_checker_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_history ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id AND role = 'User') OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin()) WITH CHECK (auth.uid() = id OR public.is_admin());

-- Wallets (Clients can ONLY SELECT own wallet; mutations strictly via server API / Admin)
DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
CREATE POLICY "wallets_select_own" ON public.wallets FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;
DROP POLICY IF EXISTS "wallets_admin_all" ON public.wallets;
CREATE POLICY "wallets_admin_all" ON public.wallets FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Deposits (Mutations strictly via /api/user/deposits server route or Admin)
DROP POLICY IF EXISTS "deposits_select_own" ON public.deposits;
CREATE POLICY "deposits_select_own" ON public.deposits FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "deposits_insert_own" ON public.deposits;
DROP POLICY IF EXISTS "deposits_admin_write" ON public.deposits;
CREATE POLICY "deposits_admin_write" ON public.deposits FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "deposits_update_admin" ON public.deposits;
CREATE POLICY "deposits_update_admin" ON public.deposits FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Withdrawals (Mutations strictly via /api/user/withdrawals server route or Admin)
DROP POLICY IF EXISTS "withdrawals_select_own" ON public.withdrawals;
CREATE POLICY "withdrawals_select_own" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "withdrawals_insert_own" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_admin_insert" ON public.withdrawals;
CREATE POLICY "withdrawals_admin_insert" ON public.withdrawals FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "withdrawals_update_admin" ON public.withdrawals;
CREATE POLICY "withdrawals_update_admin" ON public.withdrawals FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Transactions (Mutations strictly via server route or Admin)
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
CREATE POLICY "transactions_select_own" ON public.transactions FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_admin_all" ON public.transactions;
CREATE POLICY "transactions_admin_all" ON public.transactions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Secondary tables (batches, checker logs, referrals, bonus history)
DROP POLICY IF EXISTS "deposit_batches_select_own" ON public.deposit_batches;
CREATE POLICY "deposit_batches_select_own" ON public.deposit_batches FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "checker_logs_select_own" ON public.email_checker_logs;
CREATE POLICY "checker_logs_select_own" ON public.email_checker_logs FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "referral_missions_read_all" ON public.referral_missions;
CREATE POLICY "referral_missions_read_all" ON public.referral_missions FOR SELECT USING (true);

DROP POLICY IF EXISTS "referral_missions_admin_all" ON public.referral_missions;
CREATE POLICY "referral_missions_admin_all" ON public.referral_missions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "referrals_select_own" ON public.referrals;
CREATE POLICY "referrals_select_own" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id OR public.is_admin());

DROP POLICY IF EXISTS "bonus_history_select_own" ON public.bonus_history;
CREATE POLICY "bonus_history_select_own" ON public.bonus_history FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Public Read + Admin Manage: Kategori Setoran & Pengaturan Web
DROP POLICY IF EXISTS "categories_read_all" ON public.setor_categories;
CREATE POLICY "categories_read_all" ON public.setor_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "categories_admin_all" ON public.setor_categories;
CREATE POLICY "categories_admin_all" ON public.setor_categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
CREATE POLICY "app_settings_read_all" ON public.app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;
CREATE POLICY "app_settings_admin_all" ON public.app_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ==============================================================================
-- 16. DATA AWAL (SEEDING KATEGORI STANDAR)
-- ==============================================================================
INSERT INTO public.setor_categories (id, label, price, description, badge, is_active)
VALUES
  ('good', 'Gmail Fresh', 1500, 'Akun Gmail Fresh baru dibuat sesuai rules standar', 'Rekomendasi', true),
  ('bebas', 'Gmail Lama', 1000, 'Setor akun Gmail lama yang sudah ada beserta password', 'Fleksibel', true)
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label, price = EXCLUDED.price;
