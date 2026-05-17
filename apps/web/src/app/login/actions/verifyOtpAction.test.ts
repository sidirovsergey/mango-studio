import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockVerifyOtp } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockVerifyOtp: vi.fn(),
}));

vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

import { verifyOtpAction } from './verifyOtpAction';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyOtpAction', () => {
  it('anon session: verifyOtp called with type email_change', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', is_anonymous: true } } });
    mockVerifyOtp.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });

    const result = await verifyOtpAction({ email: 'test@example.com', token: '123456' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user_id).toBe('u1');
    }
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      token: '123456',
      type: 'email_change',
    });
  });

  it('cold session: verifyOtp called with type email', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({ data: { user: { id: 'u2' } }, error: null });

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
    mockVerifyOtp.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });

    const result = await verifyOtpAction({ email: 'test@example.com', token: '12345678' });

    expect(result.ok).toBe(true);
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      token: '12345678',
      type: 'email_change',
    });
  });

  it('rejects tokens shorter than 4 digits with invalid_input before hitting Supabase', async () => {
    const result = await verifyOtpAction({ email: 'test@example.com', token: '123' });

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
