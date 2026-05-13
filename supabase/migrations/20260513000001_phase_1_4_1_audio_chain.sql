-- Phase 1.4.1 — audio pipeline retry + backoff
-- Additive: new columns nullable / defaulted. Safe to roll back by ignoring.

ALTER TABLE public.media_jobs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delayed_until TIMESTAMPTZ NULL;

-- Partial index — only rows that are actually delayed pay the index cost.
CREATE INDEX IF NOT EXISTS media_jobs_delayed_until_idx
  ON public.media_jobs (delayed_until)
  WHERE delayed_until IS NOT NULL;

COMMENT ON COLUMN public.media_jobs.retry_count IS
  'Times this job''s logical operation has been retried by the auto-chain retry path. Hard-capped at 1 in pollMediaJobsAction.';
COMMENT ON COLUMN public.media_jobs.delayed_until IS
  'If set and > now(), poll-loop skips this row. Set when auto-retry needs a transient-failure backoff (~15s).';
