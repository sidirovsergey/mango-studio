import { describe, expect, it } from 'vitest';
import { SceneSchema } from './schemas';

describe('SceneSchema (1.3.5 versioned)', () => {
  it('accepts empty version arrays', () => {
    const r = SceneSchema.parse({
      scene_id: 's1',
      description: 'wide ocean',
      dialogue: { speaker: 'narrator', text: 'Привет!' },
      character_ids: [],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      audio_mode: 'auto',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    });
    expect(r.first_frame_versions).toEqual([]);
    expect(r.audio_mode).toBe('auto');
  });

  it('accepts populated versions with active pointer', () => {
    const v = {
      version_id: 'v1',
      storage: { kind: 'fal_passthrough', url: 'https://fal.media/x.jpg' },
      prompt: 'p',
      model: 'm',
      generated_at: 'now',
      cost_usd: 0.05,
      source: 'auto_continuity',
    };
    const r = SceneSchema.parse({
      scene_id: 's1',
      description: 'd',
      dialogue: null,
      character_ids: ['c1'],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      audio_mode: 'native',
      first_frame_versions: [v],
      first_frame_active_version_id: 'v1',
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    });
    expect(r.first_frame_active_version_id).toBe('v1');
  });

  it('accepts config_overrides.tier', () => {
    const r = SceneSchema.parse({
      scene_id: 's1',
      description: 'd',
      dialogue: null,
      character_ids: [],
      duration_sec: 5,
      first_frame_source: 'auto_continuity',
      audio_mode: 'auto',
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
      config_overrides: { tier: 'premium', model: 'fal-ai/veo3.1/image-to-video' },
    });
    expect(r.config_overrides?.tier).toBe('premium');
  });
});
