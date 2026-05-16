-- Atomic per-user media-job quota with pre-submit reservation.
--
-- Closes the race in app-level rate-limit (count → fal.submit → insert), where
-- N concurrent requests all see the same stale count and all submit before the
-- first writes to media_jobs. Burst protection requires the count and the
-- placeholder insert to be atomic w.r.t. concurrent reservations by the same
-- user — pg_advisory_xact_lock serializes on a per-user hash.
--
-- Lifecycle:
--   1. Action calls reserve_media_job(...) BEFORE provider.submit
--      → atomic check + insert with status='reserved'
--   2. Action runs provider.submit (fal call)
--   3a. On success: action UPDATEs row with fal_request_id, model, request_input,
--       status='pending'
--   3b. On failure: action DELETEs the reservation (no cost charged)
--
-- 'reserved' status is invisible to pollers (they filter pending/running) and to
-- the unique partial indexes (same predicate) — dedupe is enforced inside the
-- RPC under the lock instead.

-- 1. Extend status check to allow 'reserved'.
alter table public.media_jobs drop constraint if exists media_jobs_status_check;
alter table public.media_jobs
  add constraint media_jobs_status_check
  check (
    status = any (array[
      'reserved'::text,
      'pending'::text,
      'running'::text,
      'completed'::text,
      'error'::text,
      'superseded'::text,
      'cancelled'::text
    ])
  );

-- 2. Reserve a media_jobs slot atomically.
--    Returns:
--      job_id  — the new (or dedup-existing) row's id, or null if quota hit
--      used    — count of jobs in window after this reservation (null when quota hit)
--      allowed — true when the caller can proceed to provider.submit
--      dedup   — true when an active job for the same target already existed
create or replace function public.reserve_media_job(
  p_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_scene_id text default null,
  p_character_id text default null,
  p_quota_limit int default 50,
  p_window_hours int default 24
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
begin
  -- Per-user serialization. Lock auto-releases at end of the transaction
  -- (which for an RPC call is the duration of this function).
  perform pg_advisory_xact_lock(hashtext('media_quota:' || p_user_id::text));

  -- Dedupe: active job already exists for this target?
  -- Mirrors the unique partial indexes media_jobs_character_active /
  -- media_jobs_scene_active but lives inside the lock so the check is atomic
  -- with the count + insert below.
  if p_scene_id is not null then
    select id into v_existing_id from public.media_jobs
    where project_id = p_project_id
      and scene_id = p_scene_id
      and kind = p_kind
      and status in ('pending', 'running')
    limit 1;
  elsif p_character_id is not null then
    select id into v_existing_id from public.media_jobs
    where project_id = p_project_id
      and character_id = p_character_id
      and kind = p_kind
      and status in ('pending', 'running')
    limit 1;
  end if;

  if v_existing_id is not null then
    return query select v_existing_id, 0, true, true;
    return;
  end if;

  -- Quota count (only fully-recorded jobs — exclude orphaned reservations).
  select count(*) into v_used from public.media_jobs
  where user_id = p_user_id
    and created_at >= now() - make_interval(hours => p_window_hours)
    and status <> 'reserved';

  if v_used >= p_quota_limit then
    return query select null::uuid, v_used, false, false;
    return;
  end if;

  -- Reserve. Placeholder fal_request_id and model — finalized by the action
  -- after provider.submit succeeds.
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

grant execute on function public.reserve_media_job(uuid, uuid, text, text, text, int, int)
  to authenticated, anon, service_role;

-- 3. Janitor: clean up orphaned reservations older than 10 minutes. Manual /
--    cron-callable; safe to run anytime. Orphans appear when provider.submit
--    fails AFTER reserve succeeds but BEFORE the action's catch handler runs
--    (process crash, timeout, deploy mid-flight).
create or replace function public.cleanup_stale_media_reservations(p_max_age_minutes int default 10)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deleted int;
begin
  with deleted as (
    delete from public.media_jobs
    where status = 'reserved'
      and created_at < now() - make_interval(mins => p_max_age_minutes)
    returning 1
  )
  select count(*)::int into v_deleted from deleted;
  return v_deleted;
end;
$$;

grant execute on function public.cleanup_stale_media_reservations(int)
  to authenticated, anon, service_role;
