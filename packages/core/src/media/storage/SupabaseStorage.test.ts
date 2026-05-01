// packages/core/src/media/storage/SupabaseStorage.test.ts
import { describe, expect, it, vi } from 'vitest';
import { SupabaseStorage } from './SupabaseStorage';

const makeMockClient = () => ({
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ data: { path: 'foo/bar/baz.png' }, error: null })),
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: 'https://signed.example/x' },
        error: null,
      })),
    })),
  },
});

const ctx = { user_id: 'u', project_id: 'p', character_id: 'c' };

describe('SupabaseStorage', () => {
  it('persist: fetches fal URL и uploads с правильным path', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8),
          headers: new Headers({ 'content-type': 'image/png' }),
        }) as unknown as Response,
    );
    const client = makeMockClient();
    const s = new SupabaseStorage(client as never, 'character-dossiers', {
      fetchImpl: fetchMock as typeof fetch,
    });
    const asset = await s.persist('https://v3.fal.media/x.png', ctx);
    expect(asset.kind).toBe('supabase');
    expect((asset as { path: string }).path).toMatch(/^u\/p\/c\/.+\.png$/);
  });

  it('getDisplayUrl для supabase asset возвращает signed URL', async () => {
    const client = makeMockClient();
    const s = new SupabaseStorage(client as never, 'character-dossiers');
    const url = await s.getDisplayUrl({ kind: 'supabase', path: 'foo/bar.png' });
    expect(url).toBe('https://signed.example/x');
  });

  it('getDisplayUrl для fal_passthrough = pass-through', async () => {
    const client = makeMockClient();
    const s = new SupabaseStorage(client as never, 'character-dossiers');
    const url = await s.getDisplayUrl({
      kind: 'fal_passthrough',
      url: 'https://v3.fal.media/x.png',
    });
    expect(url).toBe('https://v3.fal.media/x.png');
  });
});
