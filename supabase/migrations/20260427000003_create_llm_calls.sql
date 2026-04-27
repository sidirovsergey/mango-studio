-- llm_calls: immutable audit log of all LLM calls (success + error paths)
create table public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  project_id uuid references public.projects on delete set null,
  method text not null check (method in ('generateScript','refineScene','chat')),
  model text not null,
  prompt_tokens int not null check (prompt_tokens >= 0),
  completion_tokens int not null check (completion_tokens >= 0),
  cost_usd numeric(10,6) not null check (cost_usd >= 0),
  latency_ms int not null check (latency_ms >= 0),
  status text not null default 'success' check (status in ('success','error')),
  error_code text check (
    error_code is null or
    error_code in ('rate_limit','context_length','safety_filter','timeout','invalid_json','unknown')
  ),
  created_at timestamptz not null default now(),
  check (
    (status = 'success' and error_code is null) or
    (status = 'error' and error_code is not null)
  )
);

create index idx_llm_calls_user_created on public.llm_calls(user_id, created_at desc);
create index idx_llm_calls_project on public.llm_calls(project_id) where project_id is not null;
create index idx_llm_calls_status on public.llm_calls(status) where status = 'error';

alter table public.llm_calls enable row level security;

create policy llm_calls_select_own on public.llm_calls
  for select using (auth.uid() = user_id);

create policy llm_calls_insert_own on public.llm_calls
  for insert with check (auth.uid() = user_id);
