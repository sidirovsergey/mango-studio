import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { setActiveVersionAction } from './setActiveVersionAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const ffVersion = (id: string, ts = '2026-01-01T00:00:00Z') => ({
  version_id: id,
  storage: { kind: 'fal_passthrough' as const, url: `https://cdn.fal.ai/${id}.png` },
  prompt: null,
  model: 'm',
  generated_at: ts,
  cost_usd: null,
  source: 'auto_continuity' as const,
});

const masterVersion = (id: string, ts = '2026-01-01T00:00:00Z') => ({
  version_id: id,
  storage: { kind: 'fal_passthrough' as const, url: `https://cdn.fal.ai/${id}.mp4` },
  generated_at: ts,
  cost_usd: null,
  composed_from_scene_versions: [],
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
  return { sb, update, updateEq };
}

describe('setActiveVersionAction', () => {
  it('sets first_frame_active_version_id to target version', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const script = {
      scenes: [
        {
          scene_id: 's1',
          first_frame_versions: [ffVersion('v1'), ffVersion('v2'), ffVersion('v3')],
          first_frame_active_version_id: 'v3',
        },
      ],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    };
    const { sb, update } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await setActiveVersionAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      kind: 'first_frame',
      version_id: 'v1',
    });
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0]?.[0];
    expect(payload?.script?.scenes[0]?.first_frame_active_version_id).toBe('v1');
  });

  it('rejects unknown version_id', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const script = {
      scenes: [
        {
          scene_id: 's1',
          first_frame_versions: [ffVersion('v1')],
          first_frame_active_version_id: 'v1',
        },
      ],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    };
    const { sb } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await setActiveVersionAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      kind: 'first_frame',
      version_id: 'unknown',
    });
    expect(r.ok).toBe(false);
  });

  it('handles master_clip kind without scene_id', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const script = {
      scenes: [],
      master_clip_versions: [masterVersion('mv1'), masterVersion('mv2')],
      master_clip_active_version_id: 'mv1',
    };
    const { sb, update } = buildSb(script);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await setActiveVersionAction({
      project_id: PROJECT_ID,
      kind: 'master_clip',
      version_id: 'mv2',
    });
    expect(r.ok).toBe(true);
    const payload = update.mock.calls[0]?.[0];
    expect(payload?.script?.master_clip_active_version_id).toBe('mv2');
  });

  it('rejects non-master kind without scene_id', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const r = await setActiveVersionAction({
      project_id: PROJECT_ID,
      kind: 'first_frame',
      version_id: 'v1',
    });
    expect(r.ok).toBe(false);
  });
});
