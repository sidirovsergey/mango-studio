/**
 * Per-user media-job quota for cost containment.
 *
 * Mango Studio runs on Supabase anonymous sign-ins (Faraday cage / auth deferred —
 * see project_faraday_architecture memory). Anyone landing on the site receives an
 * anon `auth.uid()` and can drive media generation against fal.ai. Without a quota,
 * an attacker (or a runaway script) burns fal credits unbounded. Production already
 * has 2040 anon users vs 5 with projects — the cost vector is real.
 *
 * Strategy: rolling 24h window per `auth.uid()`, counted from media_jobs.
 * Pre-write gate; the check is one indexed count query (~ms). Fail-open on query
 * error so an outage of the metering layer never blocks legitimate users.
 *
 * Tuning:
 *   - MANGO_RATE_LIMIT_ENABLED          ('1' default, '0' disables entirely)
 *   - MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY (default 50)
 *
 * Anchoring 50 jobs/day: a full project of 5 scenes costs ~14 jobs
 * (dossier+avatar+reference per char × N chars + first_frame per scene + video per
 * scene + master_clip). 50/day ≈ 3 full projects/day for anon free tier.
 */

import { getServerSupabase } from '@mango/db/server';

const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_QUOTA = 50;

export type QuotaResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; used: number; limit: number; error: string };

function quotaLimit(): number {
  const raw = process.env.MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY;
  if (raw === undefined || raw === '') return DEFAULT_QUOTA;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUOTA;
}

function quotaEnabled(): boolean {
  return process.env.MANGO_RATE_LIMIT_ENABLED !== '0';
}

export async function checkMediaJobQuota(userId: string): Promise<QuotaResult> {
  if (!quotaEnabled()) {
    return { ok: true, used: 0, limit: Number.POSITIVE_INFINITY };
  }

  const limit = quotaLimit();
  const sb = await getServerSupabase();
  const since = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();

  const { count, error } = await sb
    .from('media_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    // Fail-open: a metering outage must not block legitimate users.
    console.warn('[rate-limit] quota query failed, allowing request', {
      user_id: userId,
      error: error.message,
    });
    return { ok: true, used: 0, limit };
  }

  const used = count ?? 0;
  if (used >= limit) {
    return {
      ok: false,
      used,
      limit,
      error: `Дневной лимит ${limit} генераций исчерпан (${used}/${limit}). Попробуй через несколько часов.`,
    };
  }

  return { ok: true, used, limit };
}
