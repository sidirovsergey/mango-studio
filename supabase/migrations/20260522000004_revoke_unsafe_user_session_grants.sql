-- 2026-05-22 — REVERSAL of 20260522000002.
--
-- BACKGROUND
-- ----------
-- PR #53 attempted to fix `permission denied for function fn_reserve_balance`
-- by granting EXECUTE to `authenticated` + `anon`. That fix was unsafe:
-- `fn_reserve_balance` and `fn_settle_paid_intent` are both SECURITY DEFINER
-- and accept caller-supplied `p_user_id` / `p_billing_payment_id` without
-- any `auth.uid()` cross-check. Granting user-session EXECUTE turned them
-- into balance-debit-anyone primitives reachable directly via PostgREST.
--
-- Codex post-merge audit flagged within ~30 minutes; revoked via Supabase
-- MCP immediately, then this migration was authored as the canonical
-- record. Migration `20260522000002` was rewritten to a no-op stub so the
-- ordering is: 002 (no-op), 003 (trigger spelling), 004 (revoke).
--
-- THE REAL FIX
-- ------------
-- Server actions that need these functions now call them via the
-- service_role Supabase client (`getServiceRoleSupabase()`), which is only
-- usable from server-side code and is never exposed to the browser. The
-- `p_user_id` the action passes is always the server's own
-- `getCurrentUser().id` read from authenticated cookies — never from
-- arbitrary user input.
--
-- See: apps/web/src/server/actions/generateSceneVideoAction.ts,
--      apps/web/src/server/actions/generateMasterClipAction.ts.

REVOKE EXECUTE ON FUNCTION public.fn_reserve_balance(uuid, uuid, bigint, text, text)
  FROM authenticated, anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_settle_paid_intent(uuid)
  FROM authenticated, anon, PUBLIC;
