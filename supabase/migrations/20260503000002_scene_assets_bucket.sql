-- Phase 1.3 — scene-assets storage bucket
-- Private bucket для user upload override (manual first_frame / video).
-- Активен когда STORAGE_PROVIDER=supabase; в 1.3 default остаётся FalCdnPassthrough.

insert into storage.buckets (id, name, public)
values ('scene-assets', 'scene-assets', false)
on conflict (id) do nothing;

create policy scene_assets_owner_select on storage.objects
  for select using (
    bucket_id = 'scene-assets'
    and (storage.foldername(name))[1]::uuid = (select auth.uid())
  );

create policy scene_assets_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'scene-assets'
    and (storage.foldername(name))[1]::uuid = (select auth.uid())
  );

create policy scene_assets_owner_update on storage.objects
  for update using (
    bucket_id = 'scene-assets'
    and (storage.foldername(name))[1]::uuid = (select auth.uid())
  );

create policy scene_assets_owner_delete on storage.objects
  for delete using (
    bucket_id = 'scene-assets'
    and (storage.foldername(name))[1]::uuid = (select auth.uid())
  );
