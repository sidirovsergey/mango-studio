import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { setSceneTierAction } from './setSceneTierAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function buildSb(scriptIn: unknown) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const projectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: PROJECT_ID, user_id: 'u1', script: scriptIn },
      error: null,
    }),
  };
  return {
    sb: { from: vi.fn(() => ({ ...projectQuery, update })) },
    update,
  };
}

describe('setSceneTierAction', () => {
  it('sets config_overrides.tier on the targeted scene', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const script = { scenes: [{ scene_id: 's1', config_overrides: {} }] };
    const { sb, update } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await setSceneTierAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      tier: 'premium',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reverted_model).toBeNull();
    const payload = update.mock.calls[0]?.[0];
    expect(payload?.script?.scenes[0]?.config_overrides?.tier).toBe('premium');
  });

  it('reverts invalid model when tier change makes it inactive', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    // bytedance/seedance-2.0/image-to-video is premium-only.
    const script = {
      scenes: [
        {
          scene_id: 's1',
          config_overrides: {
            tier: 'premium',
            model: 'bytedance/seedance-2.0/image-to-video',
          },
        },
      ],
    };
    const { sb, update } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await setSceneTierAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      tier: 'economy',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reverted_model).toBe('bytedance/seedance-2.0/image-to-video');
    const payload = update.mock.calls[0]?.[0];
    expect(payload?.script?.scenes[0]?.config_overrides?.model).toBeUndefined();
    expect(payload?.script?.scenes[0]?.config_overrides?.tier).toBe('economy');
  });
});
