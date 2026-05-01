-- supabase/migrations/20260430000003_storage_buckets.sql
insert into storage.buckets (id, name, public)
  values ('character-references', 'character-references', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('character-dossiers', 'character-dossiers', false)
  on conflict (id) do nothing;

create policy "users own character-references"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'character-references'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  )
  with check (
    bucket_id = 'character-references'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  );

create policy "users own character-dossiers"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'character-dossiers'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  )
  with check (
    bucket_id = 'character-dossiers'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  );
