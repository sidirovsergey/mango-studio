// packages/core/src/media/FalMediaProvider.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FalMediaProvider } from './FalMediaProvider';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';

const ctx = { user_id: 'u1', project_id: 'p1', character_id: 'c1' };

describe('FalMediaProvider.generateCharacterDossier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('text-to-image: вызывает fal.subscribe с моделью + prompt', async () => {
    const mockResp = {
      data: { images: [{ url: 'https://v3.fal.media/files/abc.png' }] },
      requestId: 'req-1',
    };
    (fal.subscribe as ReturnType<typeof vi.fn>).mockResolvedValue(mockResp);

    const provider = new FalMediaProvider({ apiKey: 'fake-key' });
    const result = await provider.generateCharacterDossier(
      { prompt: 'test', model: 'fal-ai/nano-banana-2', format: '16:9', quality: '1080p' },
      ctx,
    );

    expect(fal.subscribe).toHaveBeenCalledWith(
      'fal-ai/nano-banana-2',
      expect.objectContaining({
        input: expect.objectContaining({ prompt: 'test' }),
      }),
    );
    expect(result.fal_url).toBe('https://v3.fal.media/files/abc.png');
    expect(result.fal_request_id).toBe('req-1');
    expect(result.model_used).toBe('fal-ai/nano-banana-2');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('image-to-image: при image_refs вызывает edit-модель', async () => {
    (fal.subscribe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { images: [{ url: 'https://v3.fal.media/files/edit.png' }] },
      requestId: 'req-2',
    });

    const provider = new FalMediaProvider({
      apiKey: 'k',
      resolveImageUrl: async () => 'https://example.com/ref.png',
    });

    await provider.generateCharacterDossier(
      {
        prompt: 'test',
        model: 'fal-ai/nano-banana-2',
        format: '16:9',
        quality: '1080p',
        image_refs: [{ kind: 'fal_passthrough', url: 'https://x.com/r.png' }],
      },
      ctx,
    );

    expect(fal.subscribe).toHaveBeenCalledWith(
      'fal-ai/nano-banana-2/edit',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: 'test',
          image_url: 'https://example.com/ref.png',
        }),
      }),
    );
  });

  it('429 → MediaProviderError(rate_limit)', async () => {
    (fal.subscribe as ReturnType<typeof vi.fn>).mockRejectedValue({ status: 429 });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    await expect(
      provider.generateCharacterDossier(
        { prompt: 't', model: 'fal-ai/nano-banana-2', format: '16:9', quality: '1080p' },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'rate_limit', name: 'MediaProviderError' });
  });

  it('image-to-image без resolveImageUrl падает с invalid_input', async () => {
    const provider = new FalMediaProvider({ apiKey: 'k' });
    await expect(
      provider.generateCharacterDossier(
        {
          prompt: 't',
          model: 'fal-ai/nano-banana-2',
          format: '16:9',
          quality: '1080p',
          image_refs: [{ kind: 'supabase', path: 'p' }],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('модель без edit-варианта + image_refs падает с invalid_input', async () => {
    const provider = new FalMediaProvider({
      apiKey: 'k',
      resolveImageUrl: async () => 'https://x',
    });
    await expect(
      provider.generateCharacterDossier(
        {
          prompt: 't',
          model: 'fal-ai/flux/schnell',
          format: '16:9',
          quality: '1080p',
          image_refs: [{ kind: 'supabase', path: 'p' }],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
