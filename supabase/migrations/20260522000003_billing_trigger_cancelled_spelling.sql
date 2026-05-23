-- 2026-05-22 — Phase 1.7 trigger `tg_billing_settle_on_terminal` checks
-- media_jobs.status against American 'canceled', but `media_jobs_status_check`
-- only ever allowed British 'cancelled' (so the trigger's 'canceled' branch
-- was dead code from day one).
--
-- Now that PR #53 + the cancelMediaJobAction refund-safe rewrite use the
-- correct British spelling, the trigger needs to recognise it — otherwise
-- cancelling a charged pending/running job would NOT refund the balance.
--
-- Codex BLOCKER #3 on PR #53 post-merge audit (commit afee777).
-- Applied to prod via Supabase MCP `apply_migration` before this file landed.
CREATE OR REPLACE FUNCTION public.tg_billing_settle_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '', pg_catalog, public
AS $$
BEGIN
  -- Only fire on transitions INTO terminal states from non-terminal source.
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('completed','error','cancelled') THEN RETURN NEW; END IF;

  IF NEW.status = 'completed' THEN
    PERFORM public.fn_finalise_charge(NEW.id);
  ELSIF NEW.status IN ('error','cancelled') THEN
    PERFORM public.fn_refund_reservation(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
