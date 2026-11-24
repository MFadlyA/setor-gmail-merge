-- ==============================================================================
-- SETOR GMAIL BY WINTER - OWASP TOP 10 & CLOUDFLARE SECURITY HARDENING PATCH
-- Jalankan script ini di Supabase SQL Editor untuk menutup celah Privilege
-- Escalation (RLS role spoofing) dan manipulasi saldo / transaksi langsung.
-- ==============================================================================

-- 1. Pastikan kategori 'good' dan 'bebas' tersedia untuk Foreign Key deposits
INSERT INTO public.setor_categories (id, label, price, description, badge, is_active)
VALUES
  ('good', 'Gmail Fresh', 1500, 'Akun Gmail Fresh baru dibuat sesuai rules standar', 'Rekomendasi', true),
  ('bebas', 'Gmail Lama', 1000, 'Setor akun Gmail lama yang sudah ada beserta password', 'Fleksibel', true)
ON CONFLICT (id) DO NOTHING;

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
    -- User biasa tidak boleh membuat profil dengan role selain 'User' atau milik orang lain
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'Akses ditolak: Tidak dapat membuat profil untuk pengguna lain.';
    END IF;
    NEW.role := 'User';
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Blokir perubahan id, email, dan role oleh non-admin
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

-- 4. Aktifkan RLS di SELURUH tabel (termasuk tabel referral & bonus yang sebelumnya belum aktif)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_ewallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_checker_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_history ENABLE ROW LEVEL SECURITY;

-- 5. Perketat kebijakan RLS pada Profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (
    (auth.uid() = id AND role = 'User') OR public.is_admin()
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 6. HAPUS akses tulis langsung klien ke Wallets (Kritis: Cegah manipulasi saldo bebas)
DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;
DROP POLICY IF EXISTS "wallets_admin_all" ON public.wallets;
CREATE POLICY "wallets_admin_all" ON public.wallets
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. Perketat Saved E-Wallets dengan WITH CHECK eksplisit
DROP POLICY IF EXISTS "ewallets_all_own" ON public.saved_ewallets;
CREATE POLICY "ewallets_all_own" ON public.saved_ewallets
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 8. Kunci mutasi Deposits, Withdrawals, dan Transactions agar HANYA melalui API Server (service_role) atau Admin
DROP POLICY IF EXISTS "deposits_insert_own" ON public.deposits;
DROP POLICY IF EXISTS "deposits_admin_write" ON public.deposits;
CREATE POLICY "deposits_admin_write" ON public.deposits
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "deposits_update_admin" ON public.deposits;
CREATE POLICY "deposits_update_admin" ON public.deposits
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "withdrawals_insert_own" ON public.withdrawals;
DROP POLICY IF EXISTS "withdrawals_admin_insert" ON public.withdrawals;
CREATE POLICY "withdrawals_admin_insert" ON public.withdrawals
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "withdrawals_update_admin" ON public.withdrawals;
CREATE POLICY "withdrawals_update_admin" ON public.withdrawals
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_admin_all" ON public.transactions;
CREATE POLICY "transactions_admin_all" ON public.transactions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 9. Kebijakan RLS untuk tabel pendukung (deposit_batches, email_checker_logs, referrals, bonus_history)
DROP POLICY IF EXISTS "deposit_batches_select_own" ON public.deposit_batches;
CREATE POLICY "deposit_batches_select_own" ON public.deposit_batches
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "checker_logs_select_own" ON public.email_checker_logs;
CREATE POLICY "checker_logs_select_own" ON public.email_checker_logs
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "referral_missions_read_all" ON public.referral_missions;
CREATE POLICY "referral_missions_read_all" ON public.referral_missions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "referral_missions_admin_all" ON public.referral_missions;
CREATE POLICY "referral_missions_admin_all" ON public.referral_missions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "referrals_select_own" ON public.referrals;
CREATE POLICY "referrals_select_own" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id OR public.is_admin());

DROP POLICY IF EXISTS "bonus_history_select_own" ON public.bonus_history;
CREATE POLICY "bonus_history_select_own" ON public.bonus_history
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- 10. Perluas CHECK constraint status pada deposits & withdrawals agar kompatibel penuh dengan Admin & User
ALTER TABLE public.deposits DROP CONSTRAINT IF EXISTS deposits_status_check;
ALTER TABLE public.deposits ADD CONSTRAINT deposits_status_check
  CHECK (status::text = ANY (ARRAY['pending', 'dicek', 'diterima', 'ditolak', 'accepted', 'rejected']::text[]));

ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check
  CHECK (status::text = ANY (ARRAY['diproses', 'berhasil', 'ditolak', 'pending', 'success', 'failed', 'rejected']::text[]));

-- 11. Unique partial index anti-duplikasi global setoran Gmail (kecuali yang sudah ditolak jika ingin diatur ulang, atau global penuh)
CREATE INDEX IF NOT EXISTS idx_deposits_normalized_lower ON public.deposits (LOWER(normalized_gmail));
