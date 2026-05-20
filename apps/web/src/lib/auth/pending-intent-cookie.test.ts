import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We mock next/headers BEFORE importing the SUT so the helpers see the mock
// store. The mock implements a minimal cookies() jar with get/set semantics.
type CookieRecord = { value: string; opts?: Record<string, unknown> };
const cookieStore = new Map<string, CookieRecord>();
const setSpy = vi.fn((name: string, value: string, opts?: Record<string, unknown>) => {
  // Treat maxAge:0 / empty value as a delete (same as the cookie helper
  // contract used by next/headers).
  if (opts && (opts as { maxAge?: number }).maxAge === 0) {
    cookieStore.delete(name);
    return;
  }
  cookieStore.set(name, { value, opts });
});
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const rec = cookieStore.get(name);
      return rec ? { name, value: rec.value } : undefined;
    },
    set: (...args: [name: string, value: string, opts?: Record<string, unknown>]) => {
      // next/headers accepts either positional or single-object form. Both
      // routed through one spy for assertion convenience.
      if (typeof args[0] === 'object') {
        const o = args[0] as { name: string; value: string; maxAge?: number };
        setSpy(o.name, o.value, o);
      } else {
        setSpy(args[0], args[1], args[2]);
      }
    },
  }),
}));

import {
  PENDING_INTENT_COOKIE,
  consumePendingIntent,
  decodePendingIntent,
  encodePendingIntent,
  peekPendingIntent,
  setPendingIntent,
} from './pending-intent-cookie';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const RETURN_TO = '/p/abc1234567';
// 48-byte secret — exceeds MIN_SECRET_BYTES.
const VALID_SECRET = 'a'.repeat(48);

beforeEach(() => {
  cookieStore.clear();
  setSpy.mockClear();
  vi.stubEnv('PENDING_INTENT_SECRET', VALID_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('pending-intent-cookie — encode/decode roundtrip', () => {
  it('encodes then decodes back to the same payload (modulo exp)', () => {
    const token = encodePendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    const out = decodePendingIntent(token);
    expect(out).not.toBeNull();
    expect(out?.kind).toBe('render');
    expect(out?.project_id).toBe(PROJECT_ID);
    expect(out?.return_to).toBe(RETURN_TO);
    expect(out?.exp).toBeGreaterThan(Date.now());
  });

  it('studio kind round-trips', () => {
    const token = encodePendingIntent({
      kind: 'studio',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    expect(decodePendingIntent(token)?.kind).toBe('studio');
  });
});

describe('pending-intent-cookie — decoder rejects tampered/expired/malformed', () => {
  it('HMAC tampered (mutate last byte of mac segment) → null', () => {
    const token = encodePendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    const [payload, mac] = token.split('.') as [string, string];
    const tamperedMac = `${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`;
    expect(decodePendingIntent(`${payload}.${tamperedMac}`)).toBeNull();
  });

  it('payload tampered (mutate one base64 char) → null', () => {
    const token = encodePendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    const [payload, mac] = token.split('.') as [string, string];
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
    expect(decodePendingIntent(`${tamperedPayload}.${mac}`)).toBeNull();
  });

  it('HMAC length mismatch (truncated by 1 byte after base64-decode) → null, no throw', () => {
    const token = encodePendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    const [payload, mac] = token.split('.') as [string, string];
    // Trim two base64 chars so the decoded mac is shorter than the
    // expected HMAC length. timingSafeEqual would throw on length
    // mismatch; the helper must catch this and return null instead.
    const truncatedMac = mac.slice(0, -2);
    expect(() => decodePendingIntent(`${payload}.${truncatedMac}`)).not.toThrow();
    expect(decodePendingIntent(`${payload}.${truncatedMac}`)).toBeNull();
  });

  it('expired (exp < now) → null', () => {
    // Generate a fresh cookie, then mock Date so decode sees it as expired.
    const token = encodePendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    const farFuture = Date.now() + 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(farFuture);
    expect(decodePendingIntent(token)).toBeNull();
    vi.restoreAllMocks();
  });

  it('malformed: no dot → null', () => {
    expect(decodePendingIntent('hello')).toBeNull();
  });

  it('malformed: empty string → null', () => {
    expect(decodePendingIntent('')).toBeNull();
  });

  it('malformed: invalid base64 → null', () => {
    expect(decodePendingIntent('!!!.!!!')).toBeNull();
  });

  it('rotated secret: encode with secret A, decode with secret B → null', () => {
    const token = encodePendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    vi.stubEnv('PENDING_INTENT_SECRET', 'b'.repeat(48));
    expect(decodePendingIntent(token)).toBeNull();
  });

  it('invalid payload shape: bad kind → null', () => {
    // Hand-craft a token with kind='topup_only' (not in enum).
    const secret = Buffer.from(VALID_SECRET, 'utf-8');
    const payload = {
      kind: 'topup_only',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
      exp: Date.now() + 60_000,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const mac = createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodePendingIntent(`${payloadB64}.${mac}`)).toBeNull();
  });

  it('invalid payload shape: return_to not /p/<slug> → null', () => {
    const secret = Buffer.from(VALID_SECRET, 'utf-8');
    const payload = {
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: '/login?next=/x',
      exp: Date.now() + 60_000,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const mac = createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodePendingIntent(`${payloadB64}.${mac}`)).toBeNull();
  });
});

describe('pending-intent-cookie — secret validation', () => {
  it('missing PENDING_INTENT_SECRET → encode throws', () => {
    vi.stubEnv('PENDING_INTENT_SECRET', '');
    expect(() =>
      encodePendingIntent({ kind: 'render', project_id: PROJECT_ID, return_to: RETURN_TO }),
    ).toThrow(/PENDING_INTENT_SECRET not set/);
  });

  it('weak secret (<32 bytes) → encode throws', () => {
    vi.stubEnv('PENDING_INTENT_SECRET', 'short');
    expect(() =>
      encodePendingIntent({ kind: 'render', project_id: PROJECT_ID, return_to: RETURN_TO }),
    ).toThrow(/too short/);
  });
});

describe('pending-intent-cookie — cookie store integration', () => {
  it('setPendingIntent writes httpOnly + secure + SameSite=Lax cookie', async () => {
    await setPendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    const rec = cookieStore.get(PENDING_INTENT_COOKIE);
    expect(rec).toBeDefined();
    expect(setSpy).toHaveBeenCalled();
    // Assert most recent set was with the secure/httpOnly/lax shape.
    const lastCall = setSpy.mock.calls.at(-1);
    expect(lastCall?.[2]).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('consumePendingIntent reads + clears valid cookie + returns payload', async () => {
    await setPendingIntent({
      kind: 'studio',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    expect(cookieStore.has(PENDING_INTENT_COOKIE)).toBe(true);
    const out = await consumePendingIntent();
    expect(out?.kind).toBe('studio');
    expect(cookieStore.has(PENDING_INTENT_COOKIE)).toBe(false);
  });

  it('consumePendingIntent on absent cookie → null, no clear-write fired', async () => {
    setSpy.mockClear();
    const out = await consumePendingIntent();
    expect(out).toBeNull();
    // No set call at all (nothing to clear).
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('consumePendingIntent clears cookie EVEN on invalid value (Codex SHOULD-FIX #4)', async () => {
    cookieStore.set(PENDING_INTENT_COOKIE, { value: 'garbage.notamac' });
    const out = await consumePendingIntent();
    expect(out).toBeNull();
    expect(cookieStore.has(PENDING_INTENT_COOKIE)).toBe(false);
  });

  it('consumePendingIntent clears cookie EVEN on expired value', async () => {
    const token = encodePendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    cookieStore.set(PENDING_INTENT_COOKIE, { value: token });
    const farFuture = Date.now() + 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(farFuture);
    const out = await consumePendingIntent();
    expect(out).toBeNull();
    expect(cookieStore.has(PENDING_INTENT_COOKIE)).toBe(false);
    vi.restoreAllMocks();
  });

  it('peekPendingIntent does NOT clear cookie', async () => {
    await setPendingIntent({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
    });
    const out = await peekPendingIntent();
    expect(out?.kind).toBe('render');
    expect(cookieStore.has(PENDING_INTENT_COOKIE)).toBe(true);
  });
});
