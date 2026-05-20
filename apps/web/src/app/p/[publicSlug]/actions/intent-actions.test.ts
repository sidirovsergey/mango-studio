import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing the SUT.
vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/pending-intent-cookie', () => ({
  setPendingIntent: vi.fn(),
}));
vi.mock('@/app/upgrade/actions/createTopupAction', () => ({
  createTopupAction: vi.fn(),
}));

import { createTopupAction } from '@/app/upgrade/actions/createTopupAction';
import { setPendingIntent } from '@/lib/auth/pending-intent-cookie';
import { getServerSupabase } from '@mango/db/server';
import { openProStudioAction, requestRenderAction } from './intent-actions';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const PUBLIC_SLUG = 'abc1234567';

function mockUser(opts: { is_anonymous?: boolean; email?: string | null } | null) {
  (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts ? { id: 'u1', ...opts } : null },
      }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('intent-actions — anon detection (Phase 1.8.3 Sub-phase C)', () => {
  it('requestRenderAction: anon user → setPendingIntent + return auth_required, no createTopupAction call', async () => {
    mockUser({ is_anonymous: true, email: null });

    const result = await requestRenderAction({
      projectId: PROJECT_ID,
      publicSlug: PUBLIC_SLUG,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth_required');
    }
    expect(setPendingIntent).toHaveBeenCalledTimes(1);
    expect(setPendingIntent).toHaveBeenCalledWith({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: `/p/${PUBLIC_SLUG}`,
    });
    expect(createTopupAction).not.toHaveBeenCalled();
  });

  it('requestRenderAction: authed user (email + not anonymous) → cookie NOT set, delegates to createTopupAction', async () => {
    mockUser({ is_anonymous: false, email: 'u@example.com' });
    (createTopupAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      confirmation_url: 'https://yk.test/checkout',
      payment_id: 'pay-1',
      nonce: 'n1',
    });

    const result = await requestRenderAction({
      projectId: PROJECT_ID,
      publicSlug: PUBLIC_SLUG,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation_url).toBe('https://yk.test/checkout');
    }
    expect(setPendingIntent).not.toHaveBeenCalled();
    expect(createTopupAction).toHaveBeenCalledTimes(1);
    expect(createTopupAction).toHaveBeenCalledWith({
      package_code: 'topup_2000',
      intent: {
        kind: 'render',
        project_id: PROJECT_ID,
        return_to: `/p/${PUBLIC_SLUG}`,
      },
    });
  });

  it('requestRenderAction: user without email (e.g. partially-provisioned account) → treated as anon', async () => {
    mockUser({ is_anonymous: false, email: null });

    const result = await requestRenderAction({
      projectId: PROJECT_ID,
      publicSlug: PUBLIC_SLUG,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('auth_required');
    expect(setPendingIntent).toHaveBeenCalledTimes(1);
    expect(createTopupAction).not.toHaveBeenCalled();
  });

  it('requestRenderAction: getUser returns null user → auth_required', async () => {
    mockUser(null);

    const result = await requestRenderAction({
      projectId: PROJECT_ID,
      publicSlug: PUBLIC_SLUG,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('auth_required');
    expect(setPendingIntent).toHaveBeenCalledWith({
      kind: 'render',
      project_id: PROJECT_ID,
      return_to: `/p/${PUBLIC_SLUG}`,
    });
  });

  it('openProStudioAction: anon → cookie set with kind=studio, returns auth_required', async () => {
    mockUser({ is_anonymous: true, email: null });

    const result = await openProStudioAction({
      projectId: PROJECT_ID,
      publicSlug: PUBLIC_SLUG,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('auth_required');
    expect(setPendingIntent).toHaveBeenCalledWith({
      kind: 'studio',
      project_id: PROJECT_ID,
      return_to: `/p/${PUBLIC_SLUG}`,
    });
    expect(createTopupAction).not.toHaveBeenCalled();
  });

  it('openProStudioAction: authed → delegates with kind=studio', async () => {
    mockUser({ is_anonymous: false, email: 'u@example.com' });
    (createTopupAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      confirmation_url: 'https://yk.test/studio',
      payment_id: 'pay-s',
      nonce: 'n-s',
    });

    const result = await openProStudioAction({
      projectId: PROJECT_ID,
      publicSlug: PUBLIC_SLUG,
    });

    expect(result.ok).toBe(true);
    expect(setPendingIntent).not.toHaveBeenCalled();
    expect(createTopupAction).toHaveBeenCalledWith({
      package_code: 'topup_2000',
      intent: {
        kind: 'studio',
        project_id: PROJECT_ID,
        return_to: `/p/${PUBLIC_SLUG}`,
      },
    });
  });
});
