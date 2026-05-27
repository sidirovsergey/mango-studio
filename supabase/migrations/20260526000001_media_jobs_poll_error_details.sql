-- Phase post-1.8.x diagnostic observability.
-- Capture raw exception details from fal client poll failures so root-cause
-- analysis of poll_unrecoverable terminations does not depend on Vercel
-- runtime logs (currently blocked by an observability billing limit on the
-- mango-studio-demo project). Three additive nullable text columns; backfill
-- not required — new failures start writing immediately.

ALTER TABLE public.media_jobs
  ADD COLUMN IF NOT EXISTS last_poll_error_message text,
  ADD COLUMN IF NOT EXISTS last_poll_error_name text,
  ADD COLUMN IF NOT EXISTS last_poll_error_stack text;
