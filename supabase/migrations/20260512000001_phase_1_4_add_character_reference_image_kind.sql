-- Phase 1.4.D.T2 — extend media_jobs.kind to allow character_reference_image
-- See: generateReferenceImageAction.ts + pollMediaJobsAction.ts character_reference_image branch.

BEGIN;

ALTER TABLE media_jobs DROP CONSTRAINT IF EXISTS media_jobs_kind_check;

ALTER TABLE media_jobs ADD CONSTRAINT media_jobs_kind_check
  CHECK (kind IN (
    -- Character lifecycle (1.2 + 1.3)
    'character_dossier', 'character_avatar', 'character_reference',
    -- Character lifecycle (1.4): single-pose 1:1 reference image
    'character_reference_image',
    -- Scene lifecycle: 1.3.0 names (kept for backward compat during 1.3.5 rollout)
    'first_frame', 'video', 'voice', 'final_clip', 'last_frame_extract',
    -- Scene lifecycle: 1.3.5 names (new — preferred going forward)
    'scene_first_frame', 'scene_video', 'scene_voice', 'scene_final_clip',
    -- Master clip + storage mirror
    'master_clip',
    'storage_mirror'
  ));

COMMIT;
