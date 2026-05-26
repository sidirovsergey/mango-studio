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

-- Atomic finalize: claim the media_jobs row and publish the new script in one
-- transaction. Returns FALSE when a concurrent terminal transition already
-- moved the row out of pending/running — caller MUST NOT publish the asset in
-- that case. Closes the race window between projects.script update and
-- media_jobs.status='completed' update in pollMediaJobsAction.finalizeCompleted.
CREATE OR REPLACE FUNCTION public.fn_atomic_finalize_job(
  _job_id uuid,
  _new_script jsonb,
  _cost_usd numeric,
  _latency_ms int,
  _result_storage jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_id uuid;
BEGIN
  UPDATE media_jobs
  SET status = 'completed',
      cost_usd = _cost_usd,
      latency_ms = _latency_ms,
      result_storage = _result_storage,
      updated_at = now()
  WHERE id = _job_id
    AND status IN ('pending', 'running')
  RETURNING project_id INTO _project_id;

  IF _project_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE projects
  SET script = _new_script,
      updated_at = now()
  WHERE id = _project_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_atomic_finalize_job(uuid, jsonb, numeric, int, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atomic_finalize_job(uuid, jsonb, numeric, int, jsonb) TO service_role;
