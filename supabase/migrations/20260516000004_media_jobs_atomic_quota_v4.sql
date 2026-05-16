-- Atomic quota RPC v4 — close the public RPC surface gaps flagged in
-- Codex 6th pre-merge pass.
--
-- v3 (20260516000003) left two surfaces wide open:
--   1. `reserve_media_job` accepted `p_quota_limit`, `p_window_hours`, and
--      `p_stale_reserved_minutes` from the caller, with grant-execute to anon.
--      A direct Data API call could pass `p_quota_limit = 999999` to bypass the
--      cap, or `p_stale_reserved_minutes = 0` to wipe its own in-flight
--      reservations mid-burst and slip past the lock-serialized counter.
--   2. `cleanup_stale_media_reservations` (added in v1) was security-definer
--      with grant-execute to anon. Any anon could call it with
--      `p_max_age_minutes = 0` (or a negative value) and DELETE other users'
--      'reserved' rows — after fal had already been called against them,
--      poisoning the tracking layer.
--
-- v4 fixes:
--   - reserve_media_job keeps the 8-arg signature for backwards-compat
--     during deploy (old server JS may still pass tunables for a few minutes
--     until the matching PR rolls out), but the function IGNORES caller
--     tunables and uses hard-coded constants. The cap is now a SQL-side
--     constant; changing it requires a migration (deliberate friction).
--   - cleanup_stale_media_reservations is dropped entirely. The inline
--     stale-reap inside reserve_media_job (v2+) handles cleanup per-user on
--     every reservation attempt. The standalone janitor was a belt-and-
--     suspenders that's now an attack vector.

-- 1. Drop the standalone janitor — exposed delete primitive.
drop function if exists public.cleanup_stale_media_reservations(int);

-- 2. Recreate reserve_media_job: same 8-arg signature for compat, but tunable
--    params are now ignored (overridden by SQL-side constants).
create or replace function public.reserve_media_job(
  p_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_scene_id text default null,
  p_character_id text default null,
  p_quota_limit int default null,           -- IGNORED (kept for signature compat)
  p_window_hours int default null,          -- IGNORED
  p_stale_reserved_minutes int default null -- IGNORED
)
returns table(job_id uuid, used int, allowed boolean, dedup boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  -- Constants. NOT caller-controllable. Change requires a migration.
  c_quota_limit constant int := 50;
  c_window_hours constant int := 24;
  c_stale_reserved_minutes constant int := 5;

  v_used int;
  v_job_id uuid;
  v_existing_id uuid;
  v_caller_uid uuid;
begin
  -- Discard caller-supplied tunables so anon cannot influence the cap.
  -- (Args remain in the signature so old server JS still type-matches; values
  --  are silently overridden below.)
  perform p_quota_limit, p_window_hours, p_stale_reserved_minutes;

  -- Caller identity guard. security definer means this function can read/write
  -- any row regardless of RLS; we MUST verify the client isn't impersonating
  -- another user_id. auth.uid() reflects the JWT bound to the request.
  v_caller_uid := auth.uid();
  if v_caller_uid is null or v_caller_uid <> p_user_id then
    raise exception 'forbidden: caller identity mismatch' using errcode = '42501';
  end if;

  -- Project ownership guard.
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = v_caller_uid
  ) then
    raise exception 'forbidden: project not owned' using errcode = '42501';
  end if;

  -- Per-user serialization for atomic count + insert.
  perform pg_advisory_xact_lock(hashtext('media_quota:' || p_user_id::text));

  -- Reap stale reservations for THIS user (scoped, not a global delete primitive).
  delete from public.media_jobs
  where user_id = p_user_id
    and status = 'reserved'
    and created_at < now() - make_interval(mins => c_stale_reserved_minutes);

  -- Dedupe by target. Three target shapes (scene / character / project).
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
    and created_at >= now() - make_interval(hours => c_window_hours);

  if v_used >= c_quota_limit then
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
