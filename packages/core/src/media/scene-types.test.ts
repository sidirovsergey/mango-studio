import { describe, expect, it } from 'vitest';
import {
  MasterClipSchema,
  MasterClipVersionSchema,
  SceneAssetSchema,
  SceneAssetVersionSchema,
  SceneVideoAssetSchema,
  VersionKindSchema,
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

describe('SceneAssetVersionSchema', () => {
  it('parses fal_passthrough version', () => {
    const r = SceneAssetVersionSchema.parse({
      version_id: '550e8400-e29b-41d4-a716-446655440000',
      storage: { kind: 'fal_passthrough', url: 'https://fal.media/abc.jpg' },
      prompt: 'a dolphin leaping',
      model: 'fal-ai/nano-banana-pro',
      generated_at: '2026-05-10T12:00:00Z',
      cost_usd: 0.05,
      source: 'auto_continuity',
    });
    expect(r.version_id).toMatch(/-/);
  });

  it('parses supabase storage with bucket', () => {
    const r = SceneAssetVersionSchema.parse({
      version_id: 'v1',
      storage: { kind: 'supabase', bucket: 'scene-assets', path: 'u/p/s/v.jpg' },
      prompt: null,
      model: null,
      generated_at: '2026-05-10T12:00:00Z',
      cost_usd: null,
      source: 'user_upload',
    });
    expect(r.storage.kind).toBe('supabase');
  });

  it('accepts has_native_audio for video', () => {
    const r = SceneAssetVersionSchema.parse({
      version_id: 'v1',
      storage: { kind: 'fal_passthrough', url: 'https://x.com/v.mp4' },
      prompt: 'p',
      model: 'm',
      generated_at: '2026-05-10T12:00:00Z',
      cost_usd: 0.36,
      source: 'auto_continuity',
      has_native_audio: true,
    });
    expect(r.has_native_audio).toBe(true);
  });

  it('rejects missing version_id', () => {
    expect(() =>
      SceneAssetVersionSchema.parse({
        storage: { kind: 'fal_passthrough', url: 'https://x.com' },
        prompt: 'p',
        model: 'm',
        generated_at: 'now',
        cost_usd: 0,
        source: 'auto_continuity',
      }),
    ).toThrow();
  });
});

describe('MasterClipVersionSchema', () => {
  it('parses with composed_from_scene_versions', () => {
    const r = MasterClipVersionSchema.parse({
      version_id: 'mv1',
      storage: { kind: 'fal_passthrough', url: 'https://fal.media/m.mp4' },
      generated_at: '2026-05-10T12:00:00Z',
      cost_usd: 0.005,
      composed_from_scene_versions: [
        { scene_id: 's1', video_version_id: 'v1', voice_audio_version_id: 'va1' },
        { scene_id: 's2', video_version_id: 'v2', voice_audio_version_id: null },
      ],
    });
    expect(r.composed_from_scene_versions).toHaveLength(2);
  });
});

describe('VersionKindSchema', () => {
  it('accepts all 4 kinds', () => {
    for (const k of ['first_frame', 'video', 'voice_audio', 'master_clip']) {
      expect(VersionKindSchema.parse(k)).toBe(k);
    }
  });
});
