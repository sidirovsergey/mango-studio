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

  it.each([
    ['4-digit', '1234', 'min boundary accepted'],
    ['10-digit', '1234567890', 'max boundary accepted'],
  ])('accepts %s token (%s)', async (_label, token) => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    mockVerifyOtp.mockResolvedValueOnce({ data: { user: { id: 'u-bnd' } }, error: null });
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
