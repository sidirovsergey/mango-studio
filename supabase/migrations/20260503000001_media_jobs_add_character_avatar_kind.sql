-- Phase 1.3 fix — re-add character avatar (1:1 portrait) generation as a
-- distinct kind so it can run in parallel with the main 16:9 dossier job
-- without colliding on the (project_id, character_id, kind) unique index.

alter table media_jobs drop constraint media_jobs_kind_check;
alter table media_jobs add constraint media_jobs_kind_check check (kind in (
  'character_dossier','character_reference','character_avatar',
  'first_frame','video','last_frame_extract','voice','final_clip','master_clip'
));
