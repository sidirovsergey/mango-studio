-- Atomic quota RPC v3 — close remaining holes flagged in Codex 5th pre-merge pass.
--
-- v2 (20260516000002) left three gaps:
--   1. master_clip dedup never fired — RPC dedup only had scene_id and character_id
--      branches, and master jobs pass NULL for both. Double-click on "Финализировать"
--      created multiple 'reserved' rows; second finalize then hit the
--      media_jobs_master_active unique partial index AFTER provider.submit.
--   2. v1 7-arg overload remained in the public schema with grant-execute to anon.
--      Direct calls to the old signature kept the v1 burst-race behaviour
--      (reserved excluded from count + dedup).
--   3. SECURITY DEFINER + grant-execute to anon let the RPC accept any
--      `p_user_id`/`p_project_id` from the caller, bypassing RLS. A direct
--      Data API call could create reservations against arbitrary users/projects.
--
-- v3 fixes:
--   - Drop the v1 7-arg overload entirely so only the v3 signature exists.
--   - Add a third dedup branch for project-scoped kinds (scene_id IS NULL AND
--     character_id IS NULL) — dedup on (project_id, kind). Catches master_clip
--     and any future project-level kind.
--   - Enforce `auth.uid() = p_user_id` and project ownership inside the
--     function. Bypassing RLS via security definer is still necessary for
--     the cross-user count query and the privileged insert, but the caller
--     identity must match what they claim.

-- 1. Drop the v1 overload. CASCADE not needed — nothing depends on the function.
drop function if exists public.reserve_media_job(uuid, uuid, text, text, text, int, int);

-- 2. Recreate the 8-arg function with the master_clip branch + auth guard.
create or replace function public.reserve_media_job(
  p_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_scene_id text default null,
  p_character_id text default null,
  p_quota_limit int default 50,
  p_window_hours int default 24,
  p_stale_reserved_minutes int default 5
)
returns table(job_id uuid, used int, allowed boolean, dedup boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_used int;
  v_job_id uuid;
  v_existing_id uuid;
  v_caller_uid uuid;
begin
  -- Caller identity guard. security definer means this function can read/write
  -- any row regardless of RLS; we MUST verify the client isn't impersonating
  -- another user_id. auth.uid() reflects the JWT bound to the request.
  v_caller_uid := auth.uid();
  if v_caller_uid is null or v_caller_uid <> p_user_id then
    raise exception 'forbidden: caller identity mismatch' using errcode = '42501';
  end if;

  -- Project ownership guard. Prevents a logged-in user from creating
  -- reservations against someone else's project_id (still possible without
  -- this check because the FK to projects accepts any valid id).
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = v_caller_uid
  ) then
    raise exception 'forbidden: project not owned' using errcode = '42501';
  end if;

  -- Per-user serialization for atomic count + insert.
  perform pg_advisory_xact_lock(hashtext('media_quota:' || p_user_id::text));

  -- Reap stale reservations (process crash, deploy mid-flight) so they don't
  -- permanently lock out this user's quota.
  delete from public.media_jobs
  where user_id = p_user_id
    and status = 'reserved'
    and created_at < now() - make_interval(mins => p_stale_reserved_minutes);

  -- Dedupe by target. Three target shapes:
  --   - scene_id present → scene-scoped (first_frame, video, voice, etc.)
  --   - character_id present → character-scoped (dossier, avatar, ref-image)
  --   - both NULL → project-scoped (master_clip, future global kinds)
  -- Includes 'reserved' so a double-click on the same target doesn't spawn
  -- two reservations (v2 was missing the project-scoped branch entirely).
  if p_scene_id is not null then
    select id into v_existing_id from public.media_jobs
    where project_id = p_project_id
      and scene_id = p_scene_id
      and kind = p_kind
      and status in ('reserved', 'pending', 'running')
    limit 1;
  elsif p_character_id is not null then
    select id into v_existing_id from public.media_jobs
    where project_id = p_project_id
      and character_id = p_character_id
      and kind = p_kind
      and status in ('reserved', 'pending', 'running')
    limit 1;
  else
    -- Project-scoped: dedup on (project_id, kind). Mirrors the partial unique
    -- index `media_jobs_master_active` predicate but checked here under the
    -- lock so 'reserved' rows are caught too.
    select id into v_existing_id from public.media_jobs
    where project_id = p_project_id
      and kind = p_kind
      and status in ('reserved', 'pending', 'running')
    limit 1;
  end if;

  if v_existing_id is not null then
    return query select v_existing_id, 0, true, true;
    return;
  end if;

  -- Quota count includes 'reserved' so pre-submit slots consume quota atomically.
  select count(*) into v_used from public.media_jobs
  where user_id = p_user_id
    and created_at >= now() - make_interval(hours => p_window_hours);

  if v_used >= p_quota_limit then
    return query select null::uuid, v_used, false, false;
    return;
  end if;

  insert into public.media_jobs (
    user_id, project_id, scene_id, character_id, kind, model, fal_request_id, status
  )
  values (
    p_user_id, p_project_id, p_scene_id, p_character_id, p_kind,
    'reserved', 'reserved:' || gen_random_uuid()::text, 'reserved'
  )
  returning id into v_job_id;

  return query select v_job_id, v_used + 1, true, false;
end;
$$;

grant execute on function public.reserve_media_job(uuid, uuid, text, text, text, int, int, int)
  to authenticated, anon, service_role;
