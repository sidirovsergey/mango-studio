import { describe, it, expect } from 'vitest';
import { CharacterSchema } from './types';

describe('CharacterSchema', () => {
  it('parses минимальный character (только id+name)', () => {
    const out = CharacterSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Дэнни',
    });
    expect(out.description).toBe('');
    expect(out.full_prompt).toBe('');
    expect(out.appearance).toEqual({});
    expect(out.voice).toEqual({});
    expect(out.dossier).toBeNull();
    expect(out.reference_images).toEqual([]);
  });

  it('parses полный character с dossier', () => {
    const out = CharacterSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Дэнни',
      description: 'дельфин',
      full_prompt: 'long prompt',
      appearance: { species: 'дельфин', distinctive: ['веснушки'] },
      personality: 'добрый',
      voice: { description: 'warm baritone', tts_provider: 'elevenlabs' },
      dossier: {
        storage: { kind: 'fal_passthrough', url: 'https://v3.fal.media/x.png' },
        model: 'fal-ai/nano-banana-2',
        format: '16:9',
        quality: '1080p',
        generated_at: '2026-04-30T10:00:00Z',
      },
      reference_images: [
        {
          storage: { kind: 'supabase', path: 'u/p/c/r.png' },
          source: 'user_upload',
          uploaded_at: '2026-04-30T10:01:00Z',
        },
      ],
    });
    expect(out.dossier?.format).toBe('16:9');
    expect(out.reference_images).toHaveLength(1);
  });
});
