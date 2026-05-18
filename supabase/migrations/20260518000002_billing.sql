-- Add balance to user_accounts (kopeks for atomic precision; $1 ≈ 100 RUB ≈ 10000 kopeks)
ALTER TABLE user_accounts
  ADD COLUMN balance_kopeks bigint NOT NULL DEFAULT 0 CHECK (balance_kopeks >= 0);

-- Payment intents (one per ЮKassa Payment.create call)
CREATE TABLE billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'yookassa' CHECK (provider IN ('yookassa')),
  provider_payment_id text NOT NULL UNIQUE,  -- ЮKassa idempotency key
  amount_kopeks bigint NOT NULL CHECK (amount_kopeks > 0),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency IN ('RUB')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','canceled','failed','refunded')),
  package_code text NOT NULL CHECK (package_code IN ('topup_2000','topup_5000','topup_10000')),
  created_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb  -- ЮKassa raw response
);

CREATE INDEX billing_payments_user_id_created_at_idx
  ON billing_payments (user_id, created_at DESC);

-- Charges (one per reserved media_job; tracks lifecycle reserved → charged | refunded)
-- This IS the held-balance ledger that prevents concurrent-submit race
-- (Codex BLOCKER #3): balance is debited at reserve time, not at completion.
CREATE TABLE billing_charges (
  media_job_id uuid PRIMARY KEY REFERENCES media_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kopeks bigint NOT NULL CHECK (kopeks > 0),
  kind text NOT NULL,         -- denormalised media_jobs.kind for analytics
  model_tier text,            -- 'economy' | 'premium' | null
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','charged','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX billing_charges_user_id_created_at_idx
  ON billing_charges (user_id, created_at DESC);

-- RLS: clients read own rows only; writes via SECURITY DEFINER
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_charges  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_payments_own_select" ON billing_payments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "billing_charges_own_select" ON billing_charges
  FOR SELECT USING (user_id = auth.uid());

-- Atomic top-up function (called from webhook).
-- Codex BLOCKER #2: derives user_id + amount from the stored billing_payments
-- row (looked up by provider_payment_id), NOT caller-supplied. This means
-- a forged webhook body cannot credit a different user or a different
-- amount than what the operator's createTopupAction recorded.
-- Codex BLOCKER #4: requires a pending billing_payments row to exist;
-- returns silently for unknown provider_payment_id (treat as no-op replay).
-- Codex SHOULD-FIX #1: uses CTE so the SELECT, UPDATE billing_payments,
-- and UPDATE user_accounts are one statement (no read-then-write race).
CREATE OR REPLACE FUNCTION public.fn_apply_topup(
  p_provider_payment_id text,
  p_observed_amount_kopeks bigint  -- amount reported by webhook event body
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
DECLARE
  v_row record;
BEGIN
  WITH locked AS (
    SELECT id, user_id, amount_kopeks, status
      FROM public.billing_payments
     WHERE provider_payment_id = p_provider_payment_id
     FOR UPDATE
  ), promoted AS (
    UPDATE public.billing_payments
       SET status = 'succeeded',
           succeeded_at = COALESCE(succeeded_at, now())
     WHERE id = (SELECT id FROM locked WHERE status = 'pending')
    RETURNING id, user_id, amount_kopeks
  )
  SELECT * INTO v_row FROM promoted;

  IF v_row.id IS NULL THEN
    -- No pending row matched: either replay (already succeeded) or
    -- terminal-state mismatch (already canceled/refunded). Either way, no-op.
    RETURN;
  END IF;

  -- Defense-in-depth: webhook event body amount MUST match the amount we
  -- recorded when calling Payment.create. If ЮKassa returns a different
  -- amount (e.g. partial-capture flow), refuse the credit and leave the
  -- payment in 'succeeded' status but log the mismatch for ops review.
  IF v_row.amount_kopeks <> p_observed_amount_kopeks THEN
    RAISE WARNING '[billing] topup amount mismatch: payment=% recorded=% observed=%',
      v_row.id, v_row.amount_kopeks, p_observed_amount_kopeks;
    RETURN;
  END IF;

  UPDATE public.user_accounts
     SET balance_kopeks = balance_kopeks + v_row.amount_kopeks
   WHERE user_id = v_row.user_id;
END;
$$;

-- Atomic balance reservation function (called from server action at submit).
-- Codex BLOCKER #3 fix: atomically debit balance AND insert charges row in
-- one statement. If balance < kopeks, the UPDATE matches zero rows and
-- the INSERT is skipped via WHERE EXISTS. Returns BOOLEAN: true = reserved,
-- false = insufficient balance.
-- Codex SHOULD-FIX #1 fix: single CTE prevents read-then-write race;
-- INSERT...ON CONFLICT DO NOTHING handles trigger re-fire idempotency.
CREATE OR REPLACE FUNCTION public.fn_reserve_balance(
  p_job_id     uuid,
  p_user_id    uuid,
  p_kopeks     bigint,
  p_kind       text,
  p_model_tier text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
DECLARE
  v_already int;
BEGIN
  -- Idempotency: if charges row already exists for this job, treat as ok
  -- (caller re-tried; nothing more to do).
  SELECT 1 INTO v_already FROM public.billing_charges WHERE media_job_id = p_job_id;
  IF FOUND THEN RETURN true; END IF;

  IF p_kopeks <= 0 THEN
    -- Free kind: insert a zero-cost charged row for audit completeness, OR
    -- just return true without writing. Skip write for free kinds — keeps
    -- the table tight.
    RETURN true;
  END IF;

  WITH debit AS (
    UPDATE public.user_accounts
       SET balance_kopeks = balance_kopeks - p_kopeks
     WHERE user_id = p_user_id AND balance_kopeks >= p_kopeks
    RETURNING user_id
  )
  INSERT INTO public.billing_charges (media_job_id, user_id, kopeks, kind, model_tier, status)
  SELECT p_job_id, user_id, p_kopeks, p_kind, p_model_tier, 'reserved' FROM debit
  ON CONFLICT (media_job_id) DO NOTHING;

  -- If the INSERT happened (row count > 0), reservation succeeded.
  RETURN FOUND;
END;
$$;

-- Refund a previously-reserved charge (called from trigger when media_job
-- moves to terminal error/canceled). Idempotent via status guard.
CREATE OR REPLACE FUNCTION public.fn_refund_reservation(
  p_job_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
DECLARE
  v_row record;
BEGIN
  WITH refunded AS (
    UPDATE public.billing_charges
       SET status = 'refunded',
           settled_at = now()
     WHERE media_job_id = p_job_id
       AND status = 'reserved'
    RETURNING user_id, kopeks
  )
  SELECT * INTO v_row FROM refunded;

  IF v_row.user_id IS NULL THEN RETURN; END IF;

  UPDATE public.user_accounts
     SET balance_kopeks = balance_kopeks + v_row.kopeks
   WHERE user_id = v_row.user_id;
END;
$$;

-- Finalise a previously-reserved charge (called from trigger when media_job
-- moves to terminal completed). Just flips status — balance already debited
-- at reserve time. Idempotent via status guard.
CREATE OR REPLACE FUNCTION public.fn_finalise_charge(
  p_job_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
BEGIN
  UPDATE public.billing_charges
     SET status = 'charged',
         settled_at = now()
   WHERE media_job_id = p_job_id
     AND status = 'reserved';
END;
$$;

-- Trigger: fire reservation finalise / refund based on media_jobs status transitions
CREATE OR REPLACE FUNCTION public.tg_billing_settle_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
BEGIN
  -- Only fire on transitions INTO terminal states from non-terminal source
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('completed','error','canceled') THEN RETURN NEW; END IF;

  IF NEW.status = 'completed' THEN
    PERFORM public.fn_finalise_charge(NEW.id);
  ELSIF NEW.status IN ('error','canceled') THEN
    PERFORM public.fn_refund_reservation(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_billing_settle_on_terminal
  AFTER UPDATE OF status ON media_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_billing_settle_on_terminal();

-- Pure pricing function (mirrors KIND_PRICE_KOPEKS in @mango/core/quota/balance.ts)
CREATE OR REPLACE FUNCTION public.fn_price_kopeks(p_kind text, p_model_tier text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Image kinds — free for everyone
    WHEN p_kind IN ('character_dossier','character_avatar','character_reference','character_reference_image','first_frame','scene_first_frame') THEN 0
    -- Internal kinds — server chain, never user-charged
    WHEN p_kind IN ('last_frame_extract','storage_mirror') THEN 0
    -- Legacy audio kinds — disabled post-1.5 audio rip-out
    WHEN p_kind IN ('voice','scene_voice','final_clip','scene_final_clip') THEN 0
    -- Video kinds
    WHEN p_kind IN ('video','scene_video') AND p_model_tier = 'economy' THEN 5000   -- 50 ₽
    WHEN p_kind IN ('video','scene_video') AND p_model_tier = 'premium' THEN 25000  -- 250 ₽
    -- Master clip composition (ffmpeg)
    WHEN p_kind = 'master_clip' THEN 1000  -- 10 ₽
    ELSE 0
  END;
$$;

-- =====================================================================
-- Codex BLOCKER #1: lock down SECURITY DEFINER fns
-- All billing functions must run via service_role only (webhook handler
-- + trigger context); revoke public EXECUTE so a compromised anon JWT
-- cannot call them directly via supabase-js RPC.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.fn_apply_topup(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reserve_balance(uuid, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_refund_reservation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_finalise_charge(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_apply_topup(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reserve_balance(uuid, uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_refund_reservation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_finalise_charge(uuid) TO service_role;

-- fn_price_kopeks is pure / read-only / IMMUTABLE — safe to leave callable
-- so the trigger / TS module / RPC analytics can all use it.
