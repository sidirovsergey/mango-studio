import { describe, expect, it } from 'vitest';
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

  it('accepts character with voice_id + voice_label', () => {
    const out = CharacterSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Дельфин',
      description: 'Главный герой',
      voice_id: 'eLDc7xhWxG2FElT3kUTj',
      voice_label: 'Janet',
    });
    expect(out.voice_id).toBe('eLDc7xhWxG2FElT3kUTj');
    expect(out.voice_label).toBe('Janet');
  });

  it('voice_id + voice_label optional', () => {
    const out = CharacterSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'X',
    });
    expect(out.voice_id).toBeUndefined();
    expect(out.voice_label).toBeUndefined();
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

  it('Character.dossier accepts reference_image', () => {
    const c = CharacterSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Тест',
      dossier: {
        storage: { kind: 'fal_passthrough', url: 'https://v3.fal.media/x.png' },
        model: 'fal-ai/nano-banana-2',
        format: '16:9',
        quality: '1080p',
        generated_at: '2026-04-30T10:00:00Z',
        reference_image: { kind: 'fal_passthrough', url: 'https://v3.fal.media/ref.png' },
      },
    });
    expect(c.dossier?.reference_image).toBeDefined();
  });

  it('Character.dossier without reference_image still parses (back-compat)', () => {
    const c = CharacterSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Тест',
      dossier: {
        storage: { kind: 'fal_passthrough', url: 'https://v3.fal.media/x.png' },
        model: 'fal-ai/nano-banana-2',
        format: '16:9',
        quality: '1080p',
        generated_at: '2026-04-30T10:00:00Z',
      },
    });
    expect(c.dossier?.reference_image).toBeFalsy(); // null OR undefined OK
  });
});
