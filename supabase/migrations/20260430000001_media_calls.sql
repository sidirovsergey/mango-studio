-- supabase/migrations/20260430000001_media_calls.sql
create table media_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references projects(id) on delete set null,
  model text not null,
  method text not null check (method in (
    'generateCharacterDossier',
    'refineCharacter',
    'generateReferenceImage'
  )),
  character_id text,
  cost_usd numeric(10,6),
  latency_ms int,
  fal_request_id text,
  status text not null check (status in ('ok','error')),
  error_code text check (error_code in (
    'rate_limit','invalid_input','model_unavailable','forbidden','timeout','budget_exceeded','unknown'
  ) or error_code is null),
  created_at timestamptz not null default now(),
  constraint media_calls_status_error_xor check (
    (status = 'ok' and error_code is null) or
    (status = 'error' and error_code is not null)
  )
);

create index media_calls_user_created_idx on media_calls(user_id, created_at desc);
create index media_calls_project_idx on media_calls(project_id);

alter table media_calls enable row level security;

create policy "users see own media_calls"
  on media_calls for select
  using (auth.uid() = user_id);

create policy "users insert own media_calls"
  on media_calls for insert
  with check (auth.uid() = user_id);
