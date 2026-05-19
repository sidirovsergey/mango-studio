-- =====================================================================
-- Phase 1.8.2 — project status state machine: add CJM-canonical names,
-- migrate legacy `script_ready` rows.
-- =====================================================================
--
-- Before: CHECK (status IN ('draft', 'script_ready', 'characters_ready',
--                           'scenes_ready', 'final_ready'))
-- After:  CHECK (status IN (
--           -- CJM-canonical (Phase 1.8+):
--           'draft_input', 'generating_storyboard', 'storyboard_ready',
--           'paywalled', 'rendering', 'done', 'editing', 'error',
--           -- Legacy (pre-1.8 — kept until next data-cleanup migration):
--           'draft', 'script_ready', 'characters_ready', 'scenes_ready',
--           'final_ready'
--         ))
--
-- After the CHECK widens, we one-shot migrate `script_ready` → `storyboard_ready`
-- so the v1.8.1 gate can use the canonical name without back-compat noise.
-- Idempotent: re-running the UPDATE is a no-op.
-- =====================================================================

ALTER TABLE projects DROP CONSTRAINT projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status = ANY (ARRAY[
    'draft_input'::text,
    'generating_storyboard'::text,
    'storyboard_ready'::text,
    'paywalled'::text,
    'rendering'::text,
    'done'::text,
    'editing'::text,
    'error'::text,
    'draft'::text,
    'script_ready'::text,
    'characters_ready'::text,
    'scenes_ready'::text,
    'final_ready'::text
  ]));

UPDATE projects
   SET status = 'storyboard_ready'
 WHERE status = 'script_ready';
