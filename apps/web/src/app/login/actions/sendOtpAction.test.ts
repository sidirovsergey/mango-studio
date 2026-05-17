import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetUser, mockUpdateUser, mockSignInWithOtp } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignInWithOtp: vi.fn(),
}));

vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      signInWithOtp: mockSignInWithOtp,
    },
  }),
}));

import { sendOtpAction } from './sendOtpAction';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendOtpAction', () => {
  it('anon session: calls updateUser, NOT signInWithOtp', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { is_anonymous: true } } });
    mockUpdateUser.mockResolvedValueOnce({ error: null });

    const result = await sendOtpAction({ email: 'test@example.com' });

    expect(result.ok).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('cold session: calls signInWithOtp, NOT updateUser', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockSignInWithOtp.mockResolvedValueOnce({ error: null });

    const result = await sendOtpAction({ email: 'test@example.com' });

    expect(result.ok).toBe(true);
    expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('passes through Supabase rate-limit error', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockSignInWithOtp.mockResolvedValueOnce({
      error: { code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' },
    });

    const result = await sendOtpAction({ email: 'test@example.com' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('over_email_send_rate_limit');
    }
  });
});
