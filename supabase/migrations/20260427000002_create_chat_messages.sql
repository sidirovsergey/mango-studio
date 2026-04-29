-- chat_messages: persistent история чата с Mango per-project (immutable)
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index idx_chat_messages_project_created on public.chat_messages(project_id, created_at);

alter table public.chat_messages enable row level security;

create policy chat_messages_select_via_project on public.chat_messages
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = chat_messages.project_id and p.user_id = auth.uid()
    )
  );

create policy chat_messages_insert_via_project on public.chat_messages
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = chat_messages.project_id and p.user_id = auth.uid()
    )
  );
