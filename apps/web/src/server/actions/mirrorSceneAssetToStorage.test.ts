import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSb = {
  from: vi.fn(),
  storage: { from: vi.fn() },
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
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    mockSb.from = vi.fn(() => ({ select, update }));

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
