-- =====================================================================
-- Phase 1.7.1 — Intent ledger for post-payment dispatch
-- =====================================================================
-- See docs/superpowers/specs/2026-05-18-phase-1.7.1-intent-aware-payments-design.md
-- for full design rationale + Codex audit history.
--
-- Purpose: persist «what should happen after payment» so the webhook can
-- atomically promote intent on success and the /p/[slug]?nonce= page can
-- pick up the dispatch on user return (webhook itself does NOT enqueue —
-- 15s ЮKassa budget + auth context constraints, see enqueue-render.ts).
-- Defeats three race classes that v1.7.0 doesn't cover:
--   (a) tab close after ЮKassa redirect
--   (b) webhook arrives before user returns
--   (c) two tabs same project_id+kind
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. billing_intents table — the ledger.
-- ---------------------------------------------------------------------
CREATE TABLE billing_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('render','studio','topup_only')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','consumed','expired','canceled')),
  billing_payment_id uuid REFERENCES billing_payments(id) ON DELETE SET NULL,
  return_to text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  consumed_at timestamptz
);

-- Single pending intent per (project, kind). Defeats two-tab double-enqueue
-- at the DB layer regardless of application code paths.
-- Codex blocker fix #2 leverages this partial uniqueness in fn_get_or_create_intent.
CREATE UNIQUE INDEX billing_intents_one_pending_per_project_kind
  ON billing_intents (project_id, kind)
  WHERE status = 'pending';

CREATE INDEX billing_intents_user_status_idx
  ON billing_intents (user_id, status, created_at DESC);

CREATE INDEX billing_intents_billing_payment_id_idx
  ON billing_intents (billing_payment_id)
  WHERE billing_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. RLS — clients read own rows only; writes via SECURITY DEFINER fns.
-- ---------------------------------------------------------------------
ALTER TABLE billing_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_intents_own_select" ON billing_intents
  FOR SELECT USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. ALTER billing_payments — backlink to intent (nullable for v1.7.0 rows).
-- ---------------------------------------------------------------------
ALTER TABLE billing_payments
  ADD COLUMN intent_id uuid REFERENCES billing_intents(id) ON DELETE SET NULL;

CREATE INDEX billing_payments_intent_id_idx
  ON billing_payments (intent_id)
  WHERE intent_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. fn_get_or_create_intent — atomic upsert for createTopupAction.
-- ---------------------------------------------------------------------
-- Returns existing pending intent for (project_id, kind, user_id) if any,
-- else INSERTs a fresh one. Returned billing_payment_id may be NULL (first
-- call, no ЮKassa payment yet) or set (concurrent first-call already bound
-- a payment — caller MUST reuse that payment's confirmation_url, not call
-- ЮKassa.Payment.create again — see spec §4 Codex blocker fix #2).
--
-- Concurrency: combines FOR UPDATE pre-check with INSERT ... ON CONFLICT
-- DO NOTHING + post-select fallback. If two concurrent callers race, exactly
-- one succeeds the INSERT; the loser's post-select returns the winner's row.
--
-- SECURITY: enforces p_user_id = auth.uid() (defense against caller-supplied
-- user_id forgery). Function is REVOKEd from anon/public/authenticated and
-- GRANTed to authenticated + service_role explicitly below.
CREATE OR REPLACE FUNCTION public.fn_get_or_create_intent(
  p_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_nonce text,
  p_return_to text
) RETURNS TABLE (
  intent_id uuid,
  out_nonce text,
  out_billing_payment_id uuid,
  is_new boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_nonce text;
  v_pid uuid;
BEGIN
  -- Defense: enforce caller identity. fn cannot credit a different user.
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'fn_get_or_create_intent: user_id mismatch (got=%, auth=%)',
      p_user_id, auth.uid()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('render','studio','topup_only') THEN
    RAISE EXCEPTION 'fn_get_or_create_intent: invalid kind %', p_kind;
  END IF;

  -- Step 1: try to find existing pending intent for this (project, kind, user).
  -- FOR UPDATE serializes against concurrent INSERTs that would conflict on the
  -- partial unique index.
  SELECT bi.id, bi.nonce, bi.billing_payment_id
    INTO v_id, v_nonce, v_pid
    FROM public.billing_intents bi
   WHERE bi.project_id = p_project_id
     AND bi.kind = p_kind
     AND bi.status = 'pending'
     AND bi.user_id = p_user_id
   FOR UPDATE;

  IF FOUND THEN
    intent_id := v_id;
    out_nonce := v_nonce;
    out_billing_payment_id := v_pid;
    is_new := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 2: insert. ON CONFLICT covers race where a concurrent caller's
  -- INSERT landed between our SELECT and INSERT (the partial UNIQUE matches
  -- (project_id, kind) WHERE status='pending').
  INSERT INTO public.billing_intents (nonce, user_id, project_id, kind, return_to)
  VALUES (p_nonce, p_user_id, p_project_id, p_kind, p_return_to)
  ON CONFLICT (project_id, kind) WHERE status = 'pending' DO NOTHING
  RETURNING id, nonce, billing_payment_id
    INTO v_id, v_nonce, v_pid;

  IF FOUND THEN
    intent_id := v_id;
    out_nonce := v_nonce;
    out_billing_payment_id := v_pid;
    is_new := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 3: concurrent insert won; re-select to return their row.
  SELECT bi.id, bi.nonce, bi.billing_payment_id
    INTO v_id, v_nonce, v_pid
    FROM public.billing_intents bi
   WHERE bi.project_id = p_project_id
     AND bi.kind = p_kind
     AND bi.status = 'pending'
     AND bi.user_id = p_user_id;

  IF NOT FOUND THEN
    -- Edge case: the concurrent caller's INSERT was for a DIFFERENT user_id
    -- (legitimately, since UNIQUE doesn't include user_id — but project_id
    -- alone implies ownership in our model). Bubble up a clear error.
    RAISE EXCEPTION 'fn_get_or_create_intent: concurrent INSERT conflict but no row visible for user=%, project=%, kind=%',
      p_user_id, p_project_id, p_kind;
  END IF;

  intent_id := v_id;
  out_nonce := v_nonce;
  out_billing_payment_id := v_pid;
  is_new := false;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_or_create_intent(uuid, uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_or_create_intent(uuid, uuid, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. fn_inspect_intent — read-only state lookup for /p/[slug]?nonce= page.
-- ---------------------------------------------------------------------
-- Codex blocker fix #1: split inspect from consume. Previous design's
-- fn_consume_intent mutated paid→consumed AND returned new status, which
-- made the dispatch caller test for 'paid' but always see 'consumed'.
CREATE OR REPLACE FUNCTION public.fn_inspect_intent(p_nonce text)
RETURNS TABLE (
  intent_id uuid,
  project_id uuid,
  kind text,
  return_to text,
  intent_status text,
  payment_status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT bi.id, bi.project_id, bi.kind, bi.return_to, bi.status,
         bp.status, bi.expires_at
    FROM public.billing_intents bi
    LEFT JOIN public.billing_payments bp ON bp.id = bi.billing_payment_id
   WHERE bi.nonce = p_nonce
     AND bi.user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_inspect_intent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_inspect_intent(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. fn_settle_paid_intent — promote intent pending|expired → paid.
-- ---------------------------------------------------------------------
-- Called from the webhook handler in the same RPC chain that runs
-- fn_apply_topup. Returns the intent_id on first transition (caller then
-- enqueues media_jobs); returns NULL on replay (no double-enqueue).
--
-- Codex blocker fix #3: accept `status IN ('pending','expired')`, not just
-- 'pending'. If cron swept the row to 'expired' before the webhook lagged
-- in, we still want to honor the payment — user paid + balance was credited
-- by fn_apply_topup, so the render should fire even past TTL.
--
-- Idempotency: consumed_at IS NULL guard. After the first successful UPDATE,
-- status='paid' is no longer in ('pending','expired'), so the second call
-- matches zero rows and returns NULL.
CREATE OR REPLACE FUNCTION public.fn_settle_paid_intent(
  p_billing_payment_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
DECLARE
  v_intent_id uuid;
BEGIN
  UPDATE public.billing_intents
     SET status = 'paid'
   WHERE billing_payment_id = p_billing_payment_id
     AND status IN ('pending','expired')
     AND consumed_at IS NULL
  RETURNING id INTO v_intent_id;

  RETURN v_intent_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_paid_intent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_settle_paid_intent(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 7. fn_mark_intent_consumed — terminal state once media_jobs reserved.
-- ---------------------------------------------------------------------
-- Called by enqueueRenderForProject after all scene/master jobs are reserved.
-- Idempotent: only flips paid→consumed; consumed→consumed is a no-op match.
CREATE OR REPLACE FUNCTION public.fn_mark_intent_consumed(p_intent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
BEGIN
  UPDATE public.billing_intents
     SET status = 'consumed',
         consumed_at = now()
   WHERE id = p_intent_id
     AND status = 'paid';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mark_intent_consumed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_intent_consumed(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 8. fn_link_payment_to_intent — backlink helper for createTopupAction.
-- ---------------------------------------------------------------------
-- After createTopupAction inserts billing_payments, this fn sets
-- billing_intents.billing_payment_id atomically. Single statement so we
-- avoid a separate UPDATE round-trip from the caller.
--
-- Guard: refuses to overwrite a non-NULL billing_payment_id (prevents the
-- two-tab race from corrupting the link if both callers somehow tried to
-- bind their own payment).
CREATE OR REPLACE FUNCTION public.fn_link_payment_to_intent(
  p_intent_id uuid,
  p_billing_payment_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.billing_intents
     SET billing_payment_id = p_billing_payment_id
   WHERE id = p_intent_id
     AND billing_payment_id IS NULL
     AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_link_payment_to_intent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_link_payment_to_intent(uuid, uuid)
  TO authenticated, service_role;
