import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSb = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  // Atomic jsonb write moved to fn_mirror_version_storage RPC (2026-05-23
  // data-loss race fix). Default mock returns success; per-test overrides.
  rpc: vi.fn(async () => ({ data: true, error: null })),
};
vi.mock('@mango/db/server', () => ({
  getServiceRoleSupabase: () => mockSb,
}));
vi.mock('@/lib/auth/get-user', () => ({
  getCurrentUser: async () => ({ id: 'u1' }),
}));

import { mirrorSceneAssetToStorage } from './mirrorSceneAssetToStorage';

beforeEach(() => {
  vi.resetAllMocks();
  global.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
        headers: new Headers({ 'content-type': 'image/jpeg' }),
      }) as Response,
  );
});

describe('mirrorSceneAssetToStorage', () => {
  it('downloads from fal URL, uploads to scene-assets, updates jsonb', async () => {
    const upload = vi.fn(async () => ({
      data: { path: 'u1/p1/s1/v1-frame.jpg' },
      error: null,
    }));
    mockSb.storage.from = vi.fn(() => ({ upload }));
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: async () => ({
          data: {
            script: {
              scenes: [
                {
                  scene_id: 's1',
                  first_frame_versions: [
                    {
                      version_id: 'v1',
                      storage: { kind: 'fal_passthrough', url: 'https://fal.media/x.jpg' },
                    },
                  ],
                },
              ],
            },
          },
          error: null,
        }),
      })),
    }));
    mockSb.from = vi.fn(() => ({ select }));
    // The atomic jsonb write goes through fn_mirror_version_storage RPC.
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    mockSb.rpc = rpc;

    const r = await mirrorSceneAssetToStorage({
      project_id: 'p1',
      scene_id: 's1',
      version_id: 'v1',
      kind: 'first_frame',
      ext: 'jpg',
    });
    expect(r.ok).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      'u1/p1/s1/v1-frame.jpg',
      expect.any(Object),
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
    // Verify the RPC payload — atomic single-statement jsonb update,
    // no read-modify-write race possible (2026-05-23 BLOCKER fix).
    expect(rpc).toHaveBeenCalledWith('fn_mirror_version_storage', {
      p_project_id: 'p1',
      p_kind: 'first_frame',
      p_scene_id: 's1',
      p_version_id: 'v1',
      p_new_storage: { kind: 'supabase', bucket: 'scene-assets', path: 'u1/p1/s1/v1-frame.jpg' },
    });
  });

  it('returns ok:false on fetch failure (does not throw)', async () => {
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: async () => ({
          data: {
            script: {
              scenes: [
                {
                  scene_id: 's1',
                  first_frame_versions: [
                    {
                      version_id: 'v1',
                      storage: { kind: 'fal_passthrough', url: 'https://fal.media/x.jpg' },
                    },
                  ],
                },
              ],
            },
          },
          error: null,
        }),
      })),
    }));
    mockSb.from = vi.fn(() => ({ select }));
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    const r = await mirrorSceneAssetToStorage({
      project_id: 'p1',
      scene_id: 's1',
      version_id: 'v1',
      kind: 'first_frame',
      ext: 'jpg',
    });
    expect(r.ok).toBe(false);
  });
});
