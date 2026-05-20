import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockVerifyOtp, mockConsume, mockTopupCore } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockConsume: vi.fn(),
  mockTopupCore: vi.fn(),
}));

vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

vi.mock('@/lib/auth/pending-intent-cookie', () => ({
  consumePendingIntent: mockConsume,
}));

vi.mock('@/server/lib/topup-core', () => ({
  createTopupForAuthedUser: mockTopupCore,
}));

import { verifyOtpAction } from './verifyOtpAction';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no pending intent (covers all the pre-Phase-1.8.3 tests).
  mockConsume.mockResolvedValue(null);
});

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const RETURN_TO = '/p/abc1234567';

describe('verifyOtpAction', () => {
  it('anon session: verifyOtp called with type email_change', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', is_anonymous: true } } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1', email: 'a@b' } },
      error: null,
    });

    const result = await verifyOtpAction({ email: 'test@example.com', token: '123456' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user_id).toBe('u1');
      expect(result.next_url).toBeUndefined();
    }
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      token: '123456',
      type: 'email_change',
    });
  });

  it('cold session: verifyOtp called with type email', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u2', email: 'c@d' } },
      error: null,
    });

    const result = await verifyOtpAction({ email: 'test@example.com', token: '654321' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user_id).toBe('u2');
    }
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      token: '654321',
      type: 'email',
    });
  });

  it('accepts an 8-digit token (Supabase OTP length is configurable)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', is_anonymous: true } } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1', email: 'a@b' } },
      error: null,
    });

    const result = await verifyOtpAction({ email: 'test@example.com', token: '12345678' });

    expect(result.ok).toBe(true);
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      token: '12345678',
      type: 'email_change',
    });
  });

  it.each([
    ['4-digit', '1234', 'min boundary accepted'],
    ['10-digit', '1234567890', 'max boundary accepted'],
  ])('accepts %s token (%s)', async (_label, token) => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-bnd', email: 'e@f' } },
      error: null,
    });
    const result = await verifyOtpAction({ email: 'b@example.com', token });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['3-digit', '123', 'below min'],
    ['11-digit', '12345678901', 'above max'],
    ['alphanumeric', '12a456', 'non-numeric'],
    ['empty', '', 'empty'],
  ])('rejects %s token with invalid_input before hitting Supabase (%s)', async (_label, token) => {
    const result = await verifyOtpAction({ email: 'r@example.com', token });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input');
    }
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('passes through Supabase otp_expired error', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'otp_expired', message: 'Token has expired or is invalid' },
    });

    const result = await verifyOtpAction({ email: 'test@example.com', token: '000000' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('otp_expired');
    }
  });
});

describe('verifyOtpAction — Phase 1.8.3 Sub-phase D: pending-intent replay', () => {
  it('no pending intent + valid OTP → returns user_id, no next_url', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-no-intent', email: 'x@y' } },
      error: null,
    });
    mockConsume.mockResolvedValueOnce(null);

    const r = await verifyOtpAction({ email: 'x@example.com', token: '123456' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user_id).toBe('u-no-intent');
      expect(r.next_url).toBeUndefined();
    }
    expect(mockTopupCore).not.toHaveBeenCalled();
  });

  it('pins same-request supabase invariant: getServerSupabase called once, instance passed unchanged to topup-core (Codex C+D SHOULD-FIX)', async () => {
    // The CRITICAL Phase 1.8.3 invariant: verifyOtpAction must NOT spawn
    // a second getServerSupabase() inside the replay path. Pin it.
    const { getServerSupabase } = await import('@mango/db/server');
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-pin', email: 'pin@example.com' } },
      error: null,
    });
    mockConsume.mockResolvedValueOnce({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
      exp: Date.now() + 60_000,
    });
    mockTopupCore.mockResolvedValueOnce({
      ok: true,
      confirmation_url: 'https://yk.test/pinned',
      payment_id: 'pay-pinned',
      nonce: 'n',
    });

    await verifyOtpAction({ email: 'pin@example.com', token: '123456' });

    // getServerSupabase called exactly once (the action's only call).
    expect(getServerSupabase).toHaveBeenCalledTimes(1);
    // The instance is the same one passed to topup-core.
    const supabaseInstance = (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    const supabaseFromMock = await supabaseInstance;
    expect(mockTopupCore).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: supabaseFromMock }),
    );
  });

  it('valid pending intent + valid OTP + topup-core ok → next_url returned, cookie consumed', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-replay', email: 'r@y' } },
      error: null,
    });
    mockConsume.mockResolvedValueOnce({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
      exp: Date.now() + 60_000,
    });
    mockTopupCore.mockResolvedValueOnce({
      ok: true,
      confirmation_url: 'https://yk.test/checkout/abc',
      payment_id: 'pay-replay',
      nonce: 'n-replay',
    });

    const r = await verifyOtpAction({ email: 'r@example.com', token: '123456' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user_id).toBe('u-replay');
      expect(r.next_url).toBe('https://yk.test/checkout/abc');
    }
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockTopupCore).toHaveBeenCalledTimes(1);
    expect(mockTopupCore).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: 'u-replay', email: 'r@y' },
        input: expect.objectContaining({
          package_code: 'topup_2000',
          intent: {
            kind: 'render',
            project_id: PROJECT_ID,
            return_to: RETURN_TO,
          },
        }),
      }),
    );
  });

  it('pending intent + topup-core returns ok:false (ownership fail) → login succeeds without next_url', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-ownership-fail', email: 'o@y' } },
      error: null,
    });
    mockConsume.mockResolvedValueOnce({
      kind: 'studio',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
      exp: Date.now() + 60_000,
    });
    mockTopupCore.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'insufficient_privilege',
        message: 'project ownership check failed',
      },
    });

    const r = await verifyOtpAction({ email: 'o@example.com', token: '123456' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user_id).toBe('u-ownership-fail');
      expect(r.next_url).toBeUndefined();
    }
  });

  it('pending intent but user has no email (defensive) → no replay, no next_url', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-no-email', email: null } },
      error: null,
    });
    mockConsume.mockResolvedValueOnce({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
      exp: Date.now() + 60_000,
    });

    const r = await verifyOtpAction({ email: 'noemail@example.com', token: '123456' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next_url).toBeUndefined();
    expect(mockTopupCore).not.toHaveBeenCalled();
  });

  it('replay topup THROWS (not returns ok:false) → login still succeeds, no next_url (Codex C+D BLOCKER fix)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-throw', email: 't@example.com' } },
      error: null,
    });
    mockConsume.mockResolvedValueOnce({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: RETURN_TO,
      exp: Date.now() + 60_000,
    });
    // Core throws (e.g. intent RPC connection drop before its internal
    // YooKassa try/catch). Must NOT bubble up — login should still succeed.
    mockTopupCore.mockRejectedValueOnce(new Error('ECONNRESET to PostgREST'));

    const r = await verifyOtpAction({ email: 't@example.com', token: '123456' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user_id).toBe('u-throw');
      expect(r.next_url).toBeUndefined();
    }
  });

  it('expired/tampered cookie path: consumePendingIntent already cleared it → returns null → no replay', async () => {
    // consumePendingIntent contract: always clears, then returns null on
    // any invalid value. verifyOtpAction just sees null and skips replay.
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u-stale', email: 's@y' } },
      error: null,
    });
    mockConsume.mockResolvedValueOnce(null);

    const r = await verifyOtpAction({ email: 's@example.com', token: '123456' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next_url).toBeUndefined();
    expect(mockTopupCore).not.toHaveBeenCalled();
  });
});
