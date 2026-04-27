-- projects: основная сущность для одного мультика
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  idea text not null check (char_length(idea) between 1 and 500),
  style text not null check (style in ('3d_pixar','2d_drawn','clay_art')),
  format text not null check (format in ('9:16','16:9','1:1')),
  target_duration_sec int not null check (target_duration_sec between 15 and 90),
  script jsonb,
  title text generated always as (script->>'title') stored,
  status text not null default 'draft'
    check (status in ('draft','script_ready','characters_ready','scenes_ready','final_ready')),
  auto_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_user_updated on public.projects(user_id, updated_at desc);
create index idx_projects_status on public.projects(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id);

create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);

create policy projects_update_own on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);
