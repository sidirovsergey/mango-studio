-- 2026-05-22 — Phase 1.7 fn_reserve_balance was created with only postgres +
-- service_role EXECUTE grants. Server actions run under the user session
-- (authenticated / anon role), so every call hit:
--
--   ERROR: permission denied for function fn_reserve_balance
--
-- Discovered after PR #52 deploy via Postgres logs: user clicked
-- «Сгенерировать видео», `reserveMediaJob` created a row at status='reserved',
-- the RPC failed with permission denied, the catch block tried to flip
-- status='canceled' which ALSO failed (separate spelling-mismatch bug;
-- CHECK constraint expects British 'cancelled'). Action returned
-- `{ok:false, error:'insufficient_balance'}` to the UI but the row stayed
-- in 'reserved' forever and fal was never called.
--
-- Pairs with PR-side code fixes: 'canceled' → 'cancelled' in
-- generateSceneVideoAction.ts and generateMasterClipAction.ts.
--
-- Same pattern as `reserve_media_job` which already has these grants.
GRANT EXECUTE ON FUNCTION public.fn_reserve_balance(uuid, uuid, bigint, text, text)
  TO authenticated, anon;

-- fn_settle_paid_intent is called from /p/[publicSlug]/page.tsx (user-session
-- path, post-payment redirect). Same risk profile.
GRANT EXECUTE ON FUNCTION public.fn_settle_paid_intent(uuid)
  TO authenticated, anon;
