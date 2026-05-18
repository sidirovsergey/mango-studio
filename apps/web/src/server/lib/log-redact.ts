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
  // Detect relative input (no scheme://) so we can return relative output.
  // Codex audit E #4 fix: parsing '/p/abc?nonce=secret' against a base
  // gave 'http://localhost/p/abc?nonce=...' which broke callers expecting
  // shape-preserving behavior.
  const isRelative = !/^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl);

  try {
    const u = new URL(rawUrl, 'http://localhost');
    let changed = false;
    for (const key of SENSITIVE_PARAMS) {
      if (u.searchParams.has(key)) {
        u.searchParams.set(key, '[REDACTED]');
        changed = true;
      }
    }
    if (!changed) return rawUrl;
    return isRelative ? `${u.pathname}${u.search}${u.hash}` : u.toString();
  } catch {
    // URL parse failed — return the raw input rather than throwing inside
    // a logger call.
    return rawUrl;
  }
}
