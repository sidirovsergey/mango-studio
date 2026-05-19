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
 *   `reserve_media_job` Postgres function (migrations 20260516000001..v4)
 *   wraps the count and the placeholder insert in a per-user advisory lock so
 *   concurrent reservations serialize. The count INCLUDES 'reserved' rows so
 *   each pre-submit slot consumes quota atomically.
 *
 * Tuning lives SQL-side, not here. The RPC accepts tunable params for signature
 * compat but silently overrides them with SQL-side constants — anon-callable
 * RPCs must not let the caller relax the cap, extend the window, or shrink the
 * stale-reap TTL. To change the cap, deploy a new migration.
 *
 * Lifecycle (caller responsibility):
 *   1. reserveMediaJob(...) → discriminated { ok, mode, ... }
 *   2. if !ok: return quota error to user
 *   3. if mode === 'reserved' && dedup: return early with existing job_id
 *   4. provider.submit(...)
 *   5a. on success:
 *        - mode === 'reserved' → finalizeMediaJobReservation(...)
 *        - mode === 'bypass'   → recordPendingJob(...)  (legacy insert path)
 *   5b. on failure:
 *        - mode === 'reserved' → rollbackMediaJobReservation(...)
 *        - mode === 'bypass'   → nothing to roll back (no row exists yet)
 *
 * The bypass mode exists for two reasons:
 *   - Explicit disable via MANGO_RATE_LIMIT_ENABLED=0 (dev/test, emergency turn-off)
 *   - Belt-and-suspenders: when the RPC call itself returns a soft error (network
 *     blip, timeout) we degrade to recordPendingJob rather than fail the user's
 *     request. This is fail-open by design — losing the quota gate is preferable
 *     to losing media generation entirely while metering is unhealthy.
 *
 * Tuning:
 *   - MANGO_RATE_LIMIT_ENABLED ('1' default, '0' bypasses)
 *
 * Deprecated env (no longer respected — kept here only as a deprecation marker):
 *   - MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY → cap is now a SQL-side constant
 */

import { getServerSupabase } from '@mango/db/server';
import type { MediaJobKind } from './scene-helpers';

// Mirrors the SQL-side constant c_quota_limit in migration v4. Used only to
// shape the user-facing error message; the RPC enforces the real cap.
const SQL_QUOTA_LIMIT = 50;

export type ReserveResult =
  | { ok: true; mode: 'reserved'; job_id: string; used: number; dedup: boolean }
  | { ok: true; mode: 'bypass' }
  | { ok: false; error: string };

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

interface ReserveRpcRow {
  job_id: string | null;
  used: number;
  allowed: boolean;
  dedup: boolean;
}

/**
 * Atomic quota check + slot reservation via Postgres RPC.
 *
 * Returns a discriminated union; callers MUST branch on `mode`:
 *   - 'reserved': a media_jobs row was inserted with status='reserved'.
 *     Caller proceeds to provider.submit, then finalize or rollback.
 *   - 'bypass': no row was inserted (quota disabled or metering error).
 *     Caller proceeds to provider.submit, then uses recordPendingJob to
 *     insert a real 'pending' row.
 *
 * `ok: false` is returned ONLY when the user's quota is exhausted — a real
 * cap signal from the meter. RPC errors degrade to bypass mode, not failure.
 */
export async function reserveMediaJob(input: ReserveInput): Promise<ReserveResult> {
  if (!quotaEnabled()) {
    return { ok: true, mode: 'bypass' };
  }

  const sb = await getServerSupabase();

  // The generated Supabase types do not know about the `reserve_media_job` RPC
  // (added in migration 20260516000001 — types snapshot predates it). Cast through
  // unknown to escape the Database['public']['Functions'] union.
  //
  // Only target args are passed. Quota limit / window / stale-TTL live SQL-side
  // and are not caller-controllable (see migration v4). The RPC still accepts
  // tunable args in its signature for backward compat but silently ignores them.
  const rpc = (
    sb.rpc.bind(sb) as unknown as (
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
  });
  const { data, error } = await rpc;

  if (error) {
    // Fail-open into bypass mode — a degraded metering layer must not block
    // legitimate users. The caller's recordPendingJob still inserts a tracked
    // row, just without the burst-race protection.
    console.warn('[rate-limit] reserve_media_job RPC failed, degrading to bypass', {
      user_id: input.user_id,
      error: error.message,
    });
    return { ok: true, mode: 'bypass' };
  }

  const row: ReserveRpcRow | null = Array.isArray(data) ? (data[0] ?? null) : data;
  if (!row) {
    console.warn('[rate-limit] reserve_media_job returned empty result, degrading to bypass', {
      user_id: input.user_id,
    });
    return { ok: true, mode: 'bypass' };
  }

  if (!row.allowed) {
    return {
      ok: false,
      error: `Дневной лимит ${SQL_QUOTA_LIMIT} генераций исчерпан (${row.used}/${SQL_QUOTA_LIMIT}). Попробуй через несколько часов.`,
    };
  }

  if (row.job_id === null) {
    // Shouldn't happen when allowed=true, but stay defensive.
    console.warn('[rate-limit] reserve_media_job allowed but job_id is null, degrading to bypass', {
      user_id: input.user_id,
    });
    return { ok: true, mode: 'bypass' };
  }

  return {
    ok: true,
    mode: 'reserved',
    job_id: row.job_id,
    used: row.used,
    dedup: row.dedup,
  };
}
