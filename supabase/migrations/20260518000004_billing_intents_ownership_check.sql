-- =====================================================================
-- Phase 1.7.1 — Codex audit follow-up: project ownership check
-- =====================================================================
-- Codex audit 2026-05-18 on the 20260518000003_billing_intents migration
-- identified blocker #1: fn_get_or_create_intent is SECURITY DEFINER and
-- GRANTed to `authenticated`. It enforced p_user_id = auth.uid() but did
-- NOT verify that p_project_id is owned by p_user_id. An authed user who
-- knew or guessed another user's project UUID could create a pending
-- intent against that project, bypassing the projects RLS owner-only
-- policy.
--
-- Same gate also closes blocker #2 (cross-user partial-UNIQUE conflict):
-- if non-owners are rejected before reaching the INSERT, the only way
-- two callers can race on (project_id, kind) is if BOTH legitimately
-- own the project — which our data model forbids (one user per project).
--
-- Fix: add an EXISTS check on projects.user_id before any DB write or
-- read. topup_only kind has NULL project_id and is exempt by definition.
-- =====================================================================

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
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'fn_get_or_create_intent: user_id mismatch (got=%, auth=%)',
      p_user_id, auth.uid()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('render','studio','topup_only') THEN
    RAISE EXCEPTION 'fn_get_or_create_intent: invalid kind %', p_kind;
  END IF;

  -- Ownership gate (Codex blocker #1).
  IF p_kind <> 'topup_only' THEN
    IF p_project_id IS NULL THEN
      RAISE EXCEPTION 'fn_get_or_create_intent: project_id required for kind %', p_kind;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.projects
       WHERE id = p_project_id
         AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'fn_get_or_create_intent: project ownership check failed (user=%, project=%)',
        p_user_id, p_project_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

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

  SELECT bi.id, bi.nonce, bi.billing_payment_id
    INTO v_id, v_nonce, v_pid
    FROM public.billing_intents bi
   WHERE bi.project_id = p_project_id
     AND bi.kind = p_kind
     AND bi.status = 'pending'
     AND bi.user_id = p_user_id;

  IF NOT FOUND THEN
    -- After the ownership gate this branch should be unreachable; keep the
    -- exception as a tripwire for invariant violations (e.g. data manually
    -- mutated through service_role outside our fn).
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
