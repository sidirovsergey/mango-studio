-- Atomic quota RPC v2 — close burst-race holes flagged in Codex pre-merge audit.
--
-- v1 (20260516000001) gap: dedup check only matched 'pending'/'running' and the
-- quota count explicitly excluded 'reserved'. Under burst:
--   1. 100 concurrent requests acquire the advisory lock one-by-one.
--   2. Each sees the same stale count (0 reserved excluded).
--   3. Each inserts a 'reserved' row.
--   4. All proceed to provider.submit → cap silently breached.
-- Same target (project, scene/char, kind) clicked twice in <1s landed two
-- reservations because dedup didn't see 'reserved' either.
--
-- v2 fixes:
--   - Dedup matches 'reserved' + 'pending' + 'running' (same-target burst caught).
--   - Quota count INCLUDES 'reserved' (each reservation consumes a slot atomically).
--   - Inline stale-reservation reap before count (orphans from crashed submits
--     don't permanently lock out the user).

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
begin
  -- Per-user serialization. Lock auto-releases at end of the transaction
  -- (which for an RPC call is the duration of this function).
  perform pg_advisory_xact_lock(hashtext('media_quota:' || p_user_id::text));

  -- Reap stale reservations for THIS user before counting. Without this, a
  -- crashed submit (process death, deploy mid-flight, missed rollback) would
  -- leave 'reserved' rows that count toward quota indefinitely, locking the
  -- user out until the global janitor runs.
  delete from public.media_jobs
  where user_id = p_user_id
    and status = 'reserved'
    and created_at < now() - make_interval(mins => p_stale_reserved_minutes);

  -- Dedupe: any active OR reserved job for this target?
  -- Includes 'reserved' so a double-click on the same scene/character doesn't
  -- spawn two reservations (which v1 allowed because it skipped 'reserved').
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
  end if;

  if v_existing_id is not null then
    return query select v_existing_id, 0, true, true;
    return;
  end if;

  -- Quota count. INCLUDES 'reserved' rows so each pre-submit reservation
  -- consumes a slot. The advisory lock serializes; counting reserved closes
  -- the burst-race gap from v1. Stale reservations were already pruned above.
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
