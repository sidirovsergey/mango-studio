import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';

/**
 * Phase 1.8.3 — anonymous → authed intent preservation via HMAC-signed
 * httpOnly cookie. See:
 *   docs/superpowers/specs/2026-05-19-phase-1.8.3-anon-intent-cookie-design.md
 *
 * Threat model: cookie is a UX helper, not a security gate. The actual
 * authorisation boundary lives in `fn_get_or_create_intent` (Phase 1.7.1
 * ownership check). A stolen/replayed cookie consumed by user Y over
 * project X (owned by user Z ≠ Y) is rejected with `insufficient_privilege`
 * server-side. HMAC + expiry + clear-on-read defend against tampering and
 * stale-cookie surprises; they do NOT defend against cross-user replay
 * (that's already covered DB-side).
 */

export const PENDING_INTENT_COOKIE = 'mango_pending_intent';
const TTL_MS = 30 * 60_000;
const MIN_SECRET_BYTES = 32;

export type LegalIntentKind = 'render' | 'studio';

const PendingIntentPayloadSchema = z.object({
  kind: z.enum(['render', 'studio']),
  project_id: z.string().uuid(),
  return_to: z
    .string()
    .min(1)
    .max(256)
    .regex(/^\/p\/[A-Za-z0-9_-]+(?:[?#].*)?$/, 'return_to must be /p/<slug>'),
  exp: z.number().int().positive(),
});

export type PendingIntentPayload = z.infer<typeof PendingIntentPayloadSchema>;

/**
 * Read `PENDING_INTENT_SECRET` and validate it has at least 32 bytes of
 * material. Throws on missing or weak — fail-loud (Codex SHOULD-FIX #1
 * 2026-05-19): a silent fallback would let weak-secret cookies ship to
 * prod undetected.
 */
function getPendingIntentSecret(): Buffer {
  const raw = process.env.PENDING_INTENT_SECRET;
  if (!raw) {
    throw new Error('PENDING_INTENT_SECRET not set');
  }
  // Explicit format selection (Codex SHOULD-FIX 2026-05-20). Previously a
  // base64-vs-utf8 heuristic was ambiguous: `aaaa…` raw secrets happen to
  // be valid base64. Operator now picks the format with a prefix:
  //   - `base64:<value>`   → decode value as base64
  //   - anything else      → use raw bytes as utf-8
  // Operator recipe: `openssl rand -base64 48` then set
  //   PENDING_INTENT_SECRET=base64:<that_value>
  const BASE64_PREFIX = 'base64:';
  let bytes: Buffer;
  if (raw.startsWith(BASE64_PREFIX)) {
    const body = raw.slice(BASE64_PREFIX.length);
    bytes = Buffer.from(body, 'base64');
  } else {
    bytes = Buffer.from(raw, 'utf-8');
  }
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new Error(
      `PENDING_INTENT_SECRET too short (<${MIN_SECRET_BYTES} bytes); got ${bytes.length}`,
    );
  }
  return bytes;
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf-8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Buffer {
  // Restore padding before decoding.
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

/**
 * MAC is computed over the canonical encoded payload segment (`payload_b64`),
 * NOT over the raw JSON. This makes signature verification deterministic
 * — there's no JSON re-stringification ambiguity (key order, whitespace).
 */
function computeHmac(payloadB64: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(payloadB64, 'utf-8').digest();
}

export function encodePendingIntent(payload: Omit<PendingIntentPayload, 'exp'>): string {
  const secret = getPendingIntentSecret();
  const full: PendingIntentPayload = {
    ...payload,
    exp: Date.now() + TTL_MS,
  };
  const payloadB64 = base64url(JSON.stringify(full));
  const macB64 = base64url(computeHmac(payloadB64, secret));
  return `${payloadB64}.${macB64}`;
}

export function decodePendingIntent(token: string): PendingIntentPayload | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, macB64] = parts;
  if (!payloadB64 || !macB64) return null;

  let secret: Buffer;
  try {
    secret = getPendingIntentSecret();
  } catch {
    // Helper throws on missing/weak — treat as "can't decode anything".
    // Caller's consumePendingIntent will still clear the cookie via the
    // unconditional delete in that function.
    return null;
  }

  const expected = computeHmac(payloadB64, secret);
  let supplied: Buffer;
  try {
    supplied = base64urlDecode(macB64);
  } catch {
    return null;
  }
  if (supplied.length !== expected.length) {
    // Constant-time compare requires equal length; bail before throw.
    return null;
  }
  if (!timingSafeEqual(supplied, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(payloadB64).toString('utf-8'));
  } catch {
    return null;
  }
  const validation = PendingIntentPayloadSchema.safeParse(parsed);
  if (!validation.success) return null;
  if (validation.data.exp <= Date.now()) return null;
  return validation.data;
}

/**
 * Set the cookie. httpOnly + Secure + SameSite=Lax + Path=/. `maxAge` is in
 * seconds (browser convention); `TTL_MS` is the source of truth in ms.
 */
export async function setPendingIntent(payload: Omit<PendingIntentPayload, 'exp'>): Promise<void> {
  const token = encodePendingIntent(payload);
  const jar = await cookies();
  jar.set(PENDING_INTENT_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS / 1000,
  });
}

/**
 * Read + clear the cookie atomically. The cookie is deleted REGARDLESS of
 * whether decoding succeeded, so a tampered/expired/rotated-secret cookie
 * doesn't keep bouncing around (Codex SHOULD-FIX #4 2026-05-19).
 */
export async function consumePendingIntent(): Promise<PendingIntentPayload | null> {
  const jar = await cookies();
  const cookie = jar.get(PENDING_INTENT_COOKIE);
  if (!cookie) return null;
  // Clear before decoding so an exception in decode still leaves no
  // orphaned cookie behind.
  jar.set(PENDING_INTENT_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return decodePendingIntent(cookie.value);
}

/**
 * Read-only peek without clearing. Useful for diagnostics / pages that
 * want to surface "pending action" UI without consuming the cookie. Not
 * used in the standard auth-detour flow.
 */
export async function peekPendingIntent(): Promise<PendingIntentPayload | null> {
  const jar = await cookies();
  const cookie = jar.get(PENDING_INTENT_COOKIE);
  if (!cookie) return null;
  return decodePendingIntent(cookie.value);
}
