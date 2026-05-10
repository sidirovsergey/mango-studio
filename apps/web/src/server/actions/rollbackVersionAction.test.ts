import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { rollbackVersionAction } from './rollbackVersionAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const ffVersion = (id: string, ts: string) => ({
  version_id: id,
  storage: { kind: 'fal_passthrough' as const, url: `https://cdn.fal.ai/${id}.png` },
  prompt: null,
  model: 'm',
  generated_at: ts,
  cost_usd: null,
  source: 'auto_continuity' as const,
});

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
  const sb = {
    from: vi.fn(() => ({ ...projectQuery, update })),
  };
  return { sb, update };
}

describe('rollbackVersionAction', () => {
  it('without target_version_id, falls back to previous (by generated_at)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const script = {
      scenes: [
        {
          scene_id: 's1',
          first_frame_versions: [
            ffVersion('v1', '2026-01-01T00:00:00Z'),
            ffVersion('v2', '2026-01-02T00:00:00Z'),
            ffVersion('v3', '2026-01-03T00:00:00Z'),
          ],
          first_frame_active_version_id: 'v3',
        },
      ],
    };
    const { sb, update } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await rollbackVersionAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      kind: 'first_frame',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.active_version_id).toBe('v2');
    const payload = update.mock.calls[0]?.[0];
    expect(payload?.script?.scenes[0]?.first_frame_active_version_id).toBe('v2');
  });

  it('with target_version_id sets active to that', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const script = {
      scenes: [
        {
          scene_id: 's1',
          first_frame_versions: [
            ffVersion('v1', '2026-01-01T00:00:00Z'),
            ffVersion('v2', '2026-01-02T00:00:00Z'),
            ffVersion('v3', '2026-01-03T00:00:00Z'),
          ],
          first_frame_active_version_id: 'v3',
        },
      ],
    };
    const { sb } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await rollbackVersionAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      kind: 'first_frame',
      target_version_id: 'v1',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.active_version_id).toBe('v1');
  });

  it('rejects when no previous version exists', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const script = {
      scenes: [
        {
          scene_id: 's1',
          first_frame_versions: [ffVersion('v1', '2026-01-01T00:00:00Z')],
          first_frame_active_version_id: 'v1',
        },
      ],
    };
    const { sb } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await rollbackVersionAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      kind: 'first_frame',
    });
    expect(r.ok).toBe(false);
  });
});
