-- Phase 1.3.5: extend media_jobs.kind enum with the new scene_* names + storage_mirror.
--
-- Strategy: ADDITIVE. We keep the existing 1.3.0 kind names ('first_frame', 'video',
-- 'voice', 'final_clip') alongside the new 1.3.5 names ('scene_first_frame',
-- 'scene_video', 'scene_voice', 'scene_final_clip') so that:
--   1. Existing rows (inflight + completed jobs from v1.3.0) remain valid.
--   2. The Vercel rolling-deploy window doesn't break 1.3.0 servers writing old names.
-- Phase 1.4 cleanup migration will drop old names after a soak period in production.
--
-- Data migration of jsonb script shapes (scene.first_frame → first_frame_versions[])
-- is performed by scripts/migrate-phase-1.3.5.ts (Node CLI), invoked manually post-deploy.

BEGIN;

ALTER TABLE media_jobs DROP CONSTRAINT IF EXISTS media_jobs_kind_check;

ALTER TABLE media_jobs ADD CONSTRAINT media_jobs_kind_check
  CHECK (kind IN (
    -- Character lifecycle (1.2 + 1.3)
    'character_dossier', 'character_avatar', 'character_reference',
    -- Scene lifecycle: 1.3.0 names (kept for backward compat during 1.3.5 rollout)
    'first_frame', 'video', 'voice', 'final_clip', 'last_frame_extract',
    -- Scene lifecycle: 1.3.5 names (new — preferred going forward)
    'scene_first_frame', 'scene_video', 'scene_voice', 'scene_final_clip',
    -- Master clip + storage mirror
    'master_clip',
    'storage_mirror'
  ));

COMMIT;
