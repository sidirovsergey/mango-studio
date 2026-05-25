-- One-shot cleanup for pre-poll-tracking jobs already stuck in active states.
-- The existing tg_billing_settle_on_terminal trigger refunds reserved charges
-- on the transition to status='error'.

UPDATE public.media_jobs
SET status = 'error',
    error_code = 'stuck_in_queue',
    updated_at = now()
WHERE status IN ('reserved', 'pending')
  AND (
    (kind IN ('video', 'scene_video') AND created_at < now() - interval '10 minutes')
    OR (kind = 'character_dossier' AND created_at < now() - interval '3 minutes')
    OR (
      kind NOT IN ('video', 'scene_video', 'character_dossier')
      AND created_at < now() - interval '5 minutes'
    )
  );
