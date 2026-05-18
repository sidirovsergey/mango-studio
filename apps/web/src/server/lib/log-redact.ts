import 'server-only';

/**
 * Phase 1.7.1 — strip sensitive query parameters from URLs before logging.
 *
 * The `nonce` parameter on `/p/[slug]` is a bearer token for ~1 hour and
 * MUST NOT appear in:
 *   - Application logs (Vercel function logs, console.log calls)
 *   - Reverse-proxy access logs
 *   - Analytics (Vercel Analytics, GA, etc — operator filters these)
 *   - Error reports (Sentry, etc — if added later)
 *
 * Usage:
 *   const redacted = redactSensitiveQuery(req.url);
 *   console.log({ url: redacted, ... });
 */

const SENSITIVE_PARAMS = new Set([
  'nonce',
  // Future additions: session_token, password_reset_token, etc.
]);

export function redactSensitiveQuery(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, 'http://localhost');
    let changed = false;
    for (const key of SENSITIVE_PARAMS) {
      if (u.searchParams.has(key)) {
        u.searchParams.set(key, '[REDACTED]');
        changed = true;
      }
    }
    return changed ? u.toString() : rawUrl;
  } catch {
    // URL parse failed — return the raw input rather than throwing inside
    // a logger call.
    return rawUrl;
  }
}
