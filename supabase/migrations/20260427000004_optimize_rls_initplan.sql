-- Wrap auth.uid() calls in (select ...) so Postgres evaluates once per query
-- instead of per row. Recommended by Supabase advisors (auth_rls_initplan).
-- Behavior unchanged; only execution plan improves at scale.

drop policy projects_select_own on public.projects;
drop policy projects_insert_own on public.projects;
drop policy projects_update_own on public.projects;
drop policy projects_delete_own on public.projects;

create policy projects_select_own on public.projects
  for select using ((select auth.uid()) = user_id);

create policy projects_insert_own on public.projects
  for insert with check ((select auth.uid()) = user_id);

create policy projects_update_own on public.projects
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy projects_delete_own on public.projects
  for delete using ((select auth.uid()) = user_id);

drop policy chat_messages_select_via_project on public.chat_messages;
drop policy chat_messages_insert_via_project on public.chat_messages;

create policy chat_messages_select_via_project on public.chat_messages
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = chat_messages.project_id and p.user_id = (select auth.uid())
    )
  );

create policy chat_messages_insert_via_project on public.chat_messages
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = chat_messages.project_id and p.user_id = (select auth.uid())
    )
  );

drop policy llm_calls_select_own on public.llm_calls;
drop policy llm_calls_insert_own on public.llm_calls;

create policy llm_calls_select_own on public.llm_calls
  for select using ((select auth.uid()) = user_id);

create policy llm_calls_insert_own on public.llm_calls
  for insert with check ((select auth.uid()) = user_id);
