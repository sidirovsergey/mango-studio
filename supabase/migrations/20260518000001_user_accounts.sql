-- Phase 1.6 — Identity Foundation
-- See: docs/superpowers/specs/2026-05-17-phase-1.6-identity-design.md §3.1 / §3.7

BEGIN;

-- 1. Table -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('trial','free','premium')) DEFAULT 'trial',
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  upgraded_to_free_at timestamptz,
  upgraded_to_premium_at timestamptz
);

COMMENT ON TABLE user_accounts IS
  '1:1 extension of auth.users carrying capability tier (Phase 1.6). '
  'Provisioning + tier upgrade happen via SECURITY DEFINER triggers below.';

-- 2. RLS — clients SELECT/UPDATE own row, INSERT/DELETE denied --------------

ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_accounts_own_select" ON user_accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_accounts_own_update" ON user_accounts
  FOR UPDATE USING (user_id = auth.uid());

-- 3. Provisioning trigger (auth.users insert) -------------------------------

CREATE OR REPLACE FUNCTION public.tg_user_accounts_provision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.user_accounts (user_id, tier, email)
  VALUES (
    NEW.id,
    CASE WHEN NEW.is_anonymous THEN 'trial' ELSE 'free' END,
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_user_accounts_provision_on_auth_users_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_user_accounts_provision();

-- 4. Upgrade trigger (auth.identities insert, provider=email) ---------------

CREATE OR REPLACE FUNCTION public.tg_user_accounts_upgrade_on_email_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
BEGIN
  IF NEW.provider = 'email' THEN
    UPDATE public.user_accounts
       SET tier = 'free',
           upgraded_to_free_at = now(),
           email = NEW.identity_data->>'email'
     WHERE user_id = NEW.user_id
       AND tier = 'trial';  -- idempotent guard: no-op for free/premium
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_user_accounts_upgrade_on_email_identity_insert
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_user_accounts_upgrade_on_email_identity();

-- 5. Backfill existing users ------------------------------------------------
-- A2 verified auth.users.is_anonymous exists in prod (2026-05-17),
-- so the primary CASE expression below is correct.

INSERT INTO public.user_accounts (user_id, tier, email)
SELECT
  u.id,
  CASE WHEN u.is_anonymous THEN 'trial' ELSE 'free' END,
  u.email
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
