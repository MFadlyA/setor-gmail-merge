-- ==============================================================================
-- SEED USERS SCRIPT FOR SUPABASE AUTH & PROFILES
-- Membuat 1 Akun Admin dan 1 Akun User Biasa
-- ==============================================================================

-- 1. Pastikan ekstensi pgcrypto aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan enum user_role memiliki nilai 'user' (jika belum ada)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'user';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Perbarui trigger function handle_new_user agar kebal terhadap perbedaan kapitalisasi ('Admin' vs 'admin')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role public.user_role;
    raw_role text;
BEGIN
    raw_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', NEW.raw_app_meta_data->>'role', 'user'));
    
    BEGIN
        assigned_role := raw_role::public.user_role;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            assigned_role := 'field_technician'::public.user_role;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name'
    ) THEN
        INSERT INTO public.profiles (
            id,
            email,
            full_name,
            role
        )
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
            assigned_role
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'name'
    ) THEN
        INSERT INTO public.profiles (
            id,
            email,
            name,
            role
        )
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
            assigned_role
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Eksekusi pembuatan akun Admin & User
DO $$
DECLARE
    admin_uid uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
    user_uid  uuid := 'b0000000-0000-0000-0000-000000000002'::uuid;

    admin_email text := 'komangabiw@gmail.com';
    admin_pass  text := 'Admin123!';

    user_email  text := 'user@setorgmail.com';
    user_pass   text := 'User123!';

    has_wallets boolean;
BEGIN
    -- ==========================================================================
    -- A. INSERT / UPDATE AKUN ADMIN KE auth.users
    -- ==========================================================================
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_uid OR email = admin_email) THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            admin_uid,
            'authenticated',
            'authenticated',
            admin_email,
            crypt(admin_pass, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
            '{"name":"Komang Abiw (Admin)","full_name":"Komang Abiw (Admin)","role":"admin"}'::jsonb,
            now(),
            now(),
            '',
            '',
            '',
            ''
        );
    ELSE
        SELECT id INTO admin_uid FROM auth.users WHERE email = admin_email LIMIT 1;
        UPDATE auth.users
        SET encrypted_password = crypt(admin_pass, gen_salt('bf')),
            raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb,
            raw_user_meta_data = raw_user_meta_data || '{"role":"admin"}'::jsonb,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = admin_uid;
    END IF;

    -- ==========================================================================
    -- B. INSERT / UPDATE AKUN USER KE auth.users
    -- ==========================================================================
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_uid OR email = user_email) THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            user_uid,
            'authenticated',
            'authenticated',
            user_email,
            crypt(user_pass, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"],"role":"user"}'::jsonb,
            '{"name":"User Demo","full_name":"User Demo","role":"user"}'::jsonb,
            now(),
            now(),
            '',
            '',
            '',
            ''
        );
    ELSE
        SELECT id INTO user_uid FROM auth.users WHERE email = user_email LIMIT 1;
        UPDATE auth.users
        SET encrypted_password = crypt(user_pass, gen_salt('bf')),
            raw_app_meta_data = raw_app_meta_data || '{"role":"user"}'::jsonb,
            raw_user_meta_data = raw_user_meta_data || '{"role":"user"}'::jsonb,
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = user_uid;
    END IF;

    -- ==========================================================================
    -- C. INSERT KE auth.identities
    -- ==========================================================================
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            admin_uid,
            admin_uid,
            format('{"sub":"%s","email":"%s"}', admin_uid::text, admin_email)::jsonb,
            'email',
            admin_email,
            now(),
            now(),
            now()
        )
        ON CONFLICT (provider, provider_id) DO NOTHING;

        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            user_uid,
            user_uid,
            format('{"sub":"%s","email":"%s"}', user_uid::text, user_email)::jsonb,
            'email',
            user_email,
            now(),
            now(),
            now()
        )
        ON CONFLICT (provider, provider_id) DO NOTHING;
    END IF;

    -- ==========================================================================
    -- D. SINKRONISASI KE public.wallets (Jika tabel ada)
    -- ==========================================================================
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'wallets'
    ) INTO has_wallets;

    IF has_wallets THEN
        INSERT INTO public.wallets (user_id, balance, total_earned, total_withdrawn, minimum_withdrawal)
        VALUES (admin_uid, 0, 0, 0, 5000)
        ON CONFLICT (user_id) DO NOTHING;

        INSERT INTO public.wallets (user_id, balance, total_earned, total_withdrawn, minimum_withdrawal)
        VALUES (user_uid, 25000, 25000, 0, 5000)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RAISE NOTICE 'SUCCESS: Akun Admin (%) dan User (%) berhasil dibuat/disinkronkan!', admin_email, user_email;
END $$;
