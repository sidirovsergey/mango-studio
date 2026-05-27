-- Atomic quota v5 — close 2026-05-27 UX dead-end where users hit the
-- per-day cap due to internal infra bugs (poll_unrecoverable errors) and
-- could not finalize already-paid scene videos because master_clip was
-- counted against the same cap.
--
-- Three changes vs v4:
--   (1) Bump soft cap 50 → 500 (user-facing). Normal 4-scene project burns
--       ~14 media_jobs (script + 2 character_dossier + 2 character_avatar +
--       2 character_reference_image + 4 first_frame + 4 video). 500 ≈ 35
--       legitimate full projects/day per anon user.
--   (2) Exempt kind='master_clip' from BOTH counters. Master-clip is an
--       internal ffmpeg-api concat of already-paid scene assets — no fal
--       AI burn, no quota purpose.
--   (3) Exempt status IN ('error','cancelled') from the SOFT counter only.
--       Failed/cancelled jobs were billing-side already refunded by
--       tg_billing_settle_on_terminal; counting them against the user-
--       facing cap double-penalises users for our own infra bugs.
--
-- New: explicit HARD attempt ceiling that counts ALL non-master_clip rows
-- (including error/cancelled), set 3× soft. Closes the Codex must-fix
-- around non-monotonic semantics: a fast-error loop cannot bypass the
-- spend cap by terminalising errors quickly, because the hard counter
-- treats every attempt monotonically. Legitimate users with a high
-- failure rate hit the soft cap first; runaway loops hit the hard ceiling.
--
-- Same 8-arg signature, same anon grants. Caller tunables remain ignored.

create or replace function public.reserve_media_job(
  p_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_scene_id text default null,
  p_character_id text default null,
  p_quota_limit int default null,           -- IGNORED (signature compat)
  p_window_hours int default null,          -- IGNORED
  p_stale_reserved_minutes int default null -- IGNORED
)
returns table(job_id uuid, used int, allowed boolean, dedup boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  -- Constants — caller-uncontrollable. Change requires a migration.
  c_quota_limit constant int := 500;          -- v5: was 50
  c_hard_attempt_limit constant int := 1500;  -- v5 new — anti-drain ceiling
  c_window_hours constant int := 24;
  c_stale_reserved_minutes constant int := 5;

  v_used int;              -- soft counter (user-facing)
  v_hard_used int;         -- hard counter (anti-drain)
  v_job_id uuid;
  v_existing_id uuid;
  v_caller_uid uuid;
begin
  perform p_quota_limit, p_window_hours, p_stale_reserved_minutes;

  v_caller_uid := auth.uid();
  if v_caller_uid is null or v_caller_uid <> p_user_id then
    raise exception 'forbidden: caller identity mismatch' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = v_caller_uid
  ) then
    raise exception 'forbidden: project not owned' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('media_quota:' || p_user_id::text));

  delete from public.media_jobs
  where user_id = p_user_id
    and status = 'reserved'
    and created_at < now() - make_interval(mins => c_stale_reserved_minutes);

  -- Dedup unchanged from v4 (active-state-only).
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

  -- HARD anti-drain ceiling. Every non-master_clip attempt counts,
  -- including error/cancelled, so a fast-error loop cannot bypass.
  select count(*) into v_hard_used from public.media_jobs
  where user_id = p_user_id
    and created_at >= now() - make_interval(hours => c_window_hours)
    and kind <> 'master_clip';

  if v_hard_used >= c_hard_attempt_limit then
    return query select null::uuid, v_hard_used, false, false;
    return;
  end if;

  -- SOFT user-facing cap. Excludes error/cancelled (already refund-settled),
  -- excludes master_clip (internal concat). User-facing copy intentionally
  -- omits the number — legitimate users should never see this.
  select count(*) into v_used from public.media_jobs
  where user_id = p_user_id
    and created_at >= now() - make_interval(hours => c_window_hours)
    and kind <> 'master_clip'
    and status not in ('error', 'cancelled');

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
