import { describe, expect, it } from 'vitest';
import {
  MasterClipSchema,
  SceneAssetSchema,
  SceneVideoAssetSchema,
  VoiceAssetSchema,
} from './scene-types';

describe('SceneAssetSchema', () => {
  it('accepts fal_passthrough storage with metadata', () => {
    const parsed = SceneAssetSchema.parse({
      storage: { kind: 'fal_passthrough', url: 'https://fal.cdn/xyz.png' },
      model: 'fal-ai/nano-banana-2',
      generated_at: '2026-05-02T12:00:00Z',
      source: 'ai_text2img',
    });
    expect(parsed.source).toBe('ai_text2img');
  });

  it('rejects unknown source value', () => {
    expect(() =>
      SceneAssetSchema.parse({
        storage: { kind: 'fal_passthrough', url: 'https://fal.cdn/xyz.png' },
        model: 'm',
        generated_at: 'now',
        source: 'wrong',
      }),
    ).toThrow();
  });
});

describe('SceneVideoAssetSchema', () => {
  it('accepts video with fal_request_id and duration', () => {
    const parsed = SceneVideoAssetSchema.parse({
      storage: { kind: 'fal_passthrough', url: 'https://fal.cdn/v.mp4' },
      model: 'fal-ai/bytedance/seedance/v2/pro/image-to-video',
      generated_at: '2026-05-02T12:00:00Z',
      fal_request_id: 'req-123',
      duration_sec: 8,
      source: 'ai_img2vid',
      has_native_audio: true,
    });
    expect(parsed.has_native_audio).toBe(true);
  });
});

describe('VoiceAssetSchema', () => {
  it('accepts voice asset', () => {
    const parsed = VoiceAssetSchema.parse({
      storage: { kind: 'fal_passthrough', url: 'https://fal.cdn/v.mp3' },
      tts_provider: 'elevenlabs',
      voice_id: 'voice-abc',
      generated_at: '2026-05-02T12:00:00Z',
    });
    expect(parsed.voice_id).toBe('voice-abc');
  });
});

describe('MasterClipSchema', () => {
  it('accepts master with snapshot', () => {
    const parsed = MasterClipSchema.parse({
      storage: { kind: 'fal_passthrough', url: 'https://fal.cdn/m.mp4' },
      generated_at: '2026-05-02T12:00:00Z',
      scene_ids_snapshot: ['s1', 's2', 's3'],
      stale: false,
    });
    expect(parsed.scene_ids_snapshot).toHaveLength(3);
  });
});
