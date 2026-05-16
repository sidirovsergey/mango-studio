/**
 * Per-user media-job quota with atomic pre-submit reservation.
 *
 * Mango Studio runs on Supabase anonymous sign-ins (Faraday cage / auth deferred —
 * see project_faraday_architecture memory). Anyone landing on the site receives an
 * anon `auth.uid()` and can drive media generation against fal.ai. Without a hard
 * cap, an attacker (or a runaway script) burns fal credits unbounded.
 *
 * Why an RPC instead of a count + JS check:
 *   App-level "count → fal.submit → insert" leaves a race where N concurrent
 *   requests all see the same stale count, all submit, and only later record
 *   media_jobs rows. Bursts slip past the quota by parallelism factor. The
 *   `reserve_media_job` Postgres function (migration 20260516000001) wraps the
 *   count and the placeholder insert in a per-user advisory lock so concurrent
 *   reservations serialize.
 *
 * Lifecycle (caller responsibility):
 *   1. reserveMediaJob(...) → { ok, job_id, dedup }
 *   2. if !ok: return quota error
 *   3. if dedup: return early with existing job_id (no fal call)
 *   4. provider.submit(...)
 *   5a. on success: finalizeMediaJobReservation(job_id, fal_request_id, model, request_input)
 *   5b. on failure: rollbackMediaJobReservation(job_id) — frees the slot
 *
 * Tuning:
 *   - MANGO_RATE_LIMIT_ENABLED          ('1' default, '0' bypass)
 *   - MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY (default 50 — ~3 full projects/day for anon)
 */

import { getServerSupabase } from '@mango/db/server';
import type { MediaJobKind } from './scene-helpers';

const DEFAULT_QUOTA = 50;
const QUOTA_WINDOW_HOURS = 24;

export type ReserveResult =
  | { ok: true; job_id: string; used: number; dedup: boolean }
  | { ok: false; error: string };

function quotaLimit(): number {
  const raw = process.env.MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY;
  if (raw === undefined || raw === '') return DEFAULT_QUOTA;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUOTA;
}

function quotaEnabled(): boolean {
  return process.env.MANGO_RATE_LIMIT_ENABLED !== '0';
}

export interface ReserveInput {
  user_id: string;
  project_id: string;
  kind: MediaJobKind;
  scene_id?: string | null;
  character_id?: string | null;
}

/**
 * Atomic quota check + slot reservation. Returns the new reservation row's id,
 * or — when an active job for the same target already exists — that row's id
 * with dedup=true (caller should NOT submit again).
 *
 * When quota is exhausted, returns a friendly Russian error and no row is created.
 */
export async function reserveMediaJob(input: ReserveInput): Promise<ReserveResult> {
  if (!quotaEnabled()) {
    // Bypass mode: legacy insert path. recordPendingJob still handles dedup
    // via the unique partial index; callers that go through finalize() will
    // need a real job_id — emit a synthetic flag the caller treats as bypass.
    return { ok: true, job_id: '', used: 0, dedup: false };
  }

  const limit = quotaLimit();
  const sb = await getServerSupabase();

  // The generated Supabase types do not know about the `reserve_media_job` RPC
  // (added in migration 20260516000001 — types snapshot predates it). Cast through
  // unknown to escape the Database['public']['Functions'] union.
  const rpc = (
    sb.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: ReserveRpcRow[] | ReserveRpcRow | null;
      error: { message: string } | null;
    }>
  )('reserve_media_job', {
    p_user_id: input.user_id,
    p_project_id: input.project_id,
    p_kind: input.kind,
    p_scene_id: input.scene_id ?? null,
    p_character_id: input.character_id ?? null,
    p_quota_limit: limit,
    p_window_hours: QUOTA_WINDOW_HOURS,
  });
  const { data, error } = await rpc;

  if (error) {
    // Fail-open on metering outage — a degraded rate-limit must not block users.
    console.warn('[rate-limit] reserve_media_job RPC failed, allowing request', {
      user_id: input.user_id,
      error: error.message,
    });
    return { ok: true, job_id: '', used: 0, dedup: false };
  }

  // RPC returns a one-row set: [{ job_id, used, allowed, dedup }]
  const row: ReserveRpcRow | null = Array.isArray(data) ? (data[0] ?? null) : data;
  if (!row) {
    console.warn('[rate-limit] reserve_media_job returned empty result, allowing request', {
      user_id: input.user_id,
    });
    return { ok: true, job_id: '', used: 0, dedup: false };
  }

  if (!row.allowed) {
    return {
      ok: false,
      error: `Дневной лимит ${limit} генераций исчерпан (${row.used}/${limit}). Попробуй через несколько часов.`,
    };
  }

  return {
    ok: true,
    job_id: row.job_id as string,
    used: row.used,
    dedup: row.dedup,
  };
}

interface ReserveRpcRow {
  job_id: string | null;
  used: number;
  allowed: boolean;
  dedup: boolean;
}
