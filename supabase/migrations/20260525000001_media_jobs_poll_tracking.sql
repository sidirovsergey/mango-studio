-- Track poll visibility and stale queue detection for media jobs.

ALTER TABLE public.media_jobs
  ADD COLUMN IF NOT EXISTS poll_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz,
  ADD COLUMN IF NOT EXISTS poll_error_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_poll_error_at timestamptz;

CREATE INDEX IF NOT EXISTS media_jobs_last_polled_at_idx
  ON public.media_jobs (last_polled_at)
  WHERE status IN ('pending', 'running');

COMMENT ON COLUMN public.media_jobs.poll_count IS
  'Number of provider status checks recorded while the job is pending or running.';

COMMENT ON COLUMN public.media_jobs.last_polled_at IS
  'Timestamp of the most recent provider status check.';

COMMENT ON COLUMN public.media_jobs.poll_error_count IS
  'Consecutive provider status-check failures. Reset to 0 after a successful pending/running heartbeat.';

COMMENT ON COLUMN public.media_jobs.last_poll_error_at IS
  'Timestamp of the most recent provider status-check failure.';
