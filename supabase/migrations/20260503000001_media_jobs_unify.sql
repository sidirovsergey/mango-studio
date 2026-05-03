-- Phase 1.3 — unified media_jobs table (replaces media_calls)
-- Holds inflight + completed media operations with full audit trail.

create table media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  project_id uuid not null references projects on delete cascade,
  scene_id text,
  character_id text,
  kind text not null check (kind in (
    'character_dossier','character_reference',
    'first_frame','video','last_frame_extract','voice','final_clip','master_clip'
  )),
  model text not null,
  fal_request_id text not null,
  status text not null check (status in (
    'pending','running','completed','error','superseded','cancelled'
  )),
  error_code text,
  cost_usd numeric(10,6),
  latency_ms int,
  request_input jsonb,
  result_storage jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index media_jobs_scene_active
  on media_jobs (project_id, scene_id, kind)
  where status in ('pending','running') and scene_id is not null;

create unique index media_jobs_character_active
  on media_jobs (project_id, character_id, kind)
  where status in ('pending','running') and character_id is not null;

create unique index media_jobs_master_active
  on media_jobs (project_id, kind)
  where status in ('pending','running') and kind = 'master_clip';

create index media_jobs_polling
  on media_jobs (project_id, status)
  where status in ('pending','running');

create index media_jobs_completed
  on media_jobs (project_id, created_at desc)
  where status = 'completed';

alter table media_jobs enable row level security;

create policy media_jobs_select on media_jobs
  for select using (user_id = (select auth.uid()));

create policy media_jobs_insert on media_jobs
  for insert with check (user_id = (select auth.uid()));

create policy media_jobs_update on media_jobs
  for update using (user_id = (select auth.uid()));

create policy media_jobs_delete on media_jobs
  for delete using (user_id = (select auth.uid()));

-- Migrate media_calls rows
insert into media_jobs (user_id, project_id, character_id, kind, model, fal_request_id,
                        status, cost_usd, latency_ms, error_code, created_at)
select user_id, project_id, character_id,
       case method
         when 'generateCharacterDossier' then 'character_dossier'
         when 'refineCharacter' then 'character_dossier'
         when 'generateReferenceImage' then 'character_reference'
         else 'character_dossier'
       end,
       model, coalesce(fal_request_id, ''),
       case status when 'ok' then 'completed' else 'error' end,
       cost_usd, latency_ms, error_code, created_at
from media_calls;

drop table media_calls;

alter publication supabase_realtime add table media_jobs;

comment on table media_jobs is 'Unified media operations table (Phase 1.3). Replaces media_calls.';
