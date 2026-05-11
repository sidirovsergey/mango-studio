import { describe, expect, it } from 'vitest';
import { NarratorVoiceSchema, SceneSchema, ScriptGenSchema } from './schemas';
import { CharacterSchema } from './types';

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

it('Scene accepts new cinematography fields, all nullable', () => {
  const scene = SceneSchema.parse({
    scene_id: 's1',
    description: 'placeholder',
    description_ru: 'Кот идёт по кухне',
    description_en: 'A cat walks through the kitchen',
    duration_sec: 5,
    dialogue: null,
    character_ids: ['c1'],
    composition: { shot_size: 'medium', angle: 'eye_level' },
    camera_movement: { kind: 'dolly_in', speed: 'slow' },
    lighting: { recipe: 'warm key + cool rim' },
    audio_direction: { ambient: 'kitchen room tone' },
    arc_role: 'setup',
    tier_at_gen: 'premium',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
    first_frame_source: 'auto_continuity',
    audio_mode: 'auto',
  });
  expect(scene.composition?.shot_size).toBe('medium');
  expect(scene.description_en).toContain('cat');
});

it('Scene accepts legacy shape without new fields', () => {
  const scene = SceneSchema.parse({
    scene_id: 's1',
    description: 'Кот идёт по кухне',
    duration_sec: 5,
    dialogue: null,
    character_ids: ['c1'],
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
  expect(scene.composition).toBeNull();
  expect(scene.description_ru).toBe('Кот идёт по кухне'); // back-compat: copy from description
  expect(scene.description_en).toBeNull();
});

describe('ScriptGenSchema (1.3.5 master_clip versioned)', () => {
  const baseScene = {
    scene_id: 's1',
    description: 'd',
    dialogue: null,
    character_ids: [],
    duration_sec: 5,
    first_frame_source: 'auto_continuity' as const,
    audio_mode: 'auto' as const,
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
  };

  it('accepts empty master_clip_versions', () => {
    const r = ScriptGenSchema.parse({
      title: 'X',
      scenes: [baseScene, { ...baseScene, scene_id: 's2' }],
      characters: [{ action: 'add', name: 'Hero', description: 'd' }],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    });
    expect(r.master_clip_versions).toEqual([]);
  });

  it('accepts populated master clip with active pointer', () => {
    const mv = {
      version_id: 'mv1',
      storage: { kind: 'fal_passthrough', url: 'https://fal.media/m.mp4' },
      generated_at: 'now',
      cost_usd: 0.005,
      composed_from_scene_versions: [
        { scene_id: 's1', video_version_id: 'v1', voice_audio_version_id: null },
      ],
    };
    const r = ScriptGenSchema.parse({
      title: 'X',
      scenes: [baseScene, { ...baseScene, scene_id: 's2' }],
      characters: [{ action: 'add', name: 'Hero', description: 'd' }],
      master_clip_versions: [mv],
      master_clip_active_version_id: 'mv1',
    });
    expect(r.master_clip_active_version_id).toBe('mv1');
  });

  it('Script accepts visual_theme + tier when provided', () => {
    const script = ScriptGenSchema.parse({
      title: 'X',
      scenes: [baseScene, { ...baseScene, scene_id: 's2' }],
      characters: [{ action: 'add', name: 'Hero', description: 'd' }],
      master_clip_versions: [],
      master_clip_active_version_id: null,
      visual_theme: {
        palette: ['#F4E4BC', '#3D2914', '#E8B86D'],
        lighting: 'soft golden-hour key + warm fill + cool rim',
        lens: '85mm shallow DOF',
        motion: 'locked-off + occasional slow dolly',
        mood: 'cozy',
      },
      tier: 'premium',
    });
    expect(script.tier).toBe('premium');
    expect(script.visual_theme?.palette).toHaveLength(3);
  });

  it('Script defaults visual_theme and tier to null when omitted', () => {
    const script = ScriptGenSchema.parse({
      title: 'X',
      scenes: [baseScene, { ...baseScene, scene_id: 's2' }],
      characters: [{ action: 'add', name: 'Hero', description: 'd' }],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    });
    expect(script.visual_theme).toBeNull();
    expect(script.tier).toBeNull();
  });
});

it('NarratorVoice accepts full settings (persona + voice_settings)', () => {
  const v = NarratorVoiceSchema.parse({
    tts_voice_id: 'rachel_v3',
    persona: 'мягкий женский голос, тёплый',
    stability: 0.6,
    similarity_boost: 0.75,
    style: 0.2,
    speed: 1.0,
  });
  expect(v.persona).toContain('тёплый');
  expect(v.stability).toBe(0.6);
});

it('NarratorVoice accepts minimal {tts_voice_id} (back-compat)', () => {
  const v = NarratorVoiceSchema.parse({ tts_voice_id: 'rachel_v3' });
  expect(v.tts_voice_id).toBe('rachel_v3');
  expect(v.persona).toBeUndefined();
  expect(v.stability).toBeUndefined();
});

it('NarratorVoice rejects stability outside 0-1', () => {
  expect(() => NarratorVoiceSchema.parse({ tts_voice_id: 'x', stability: 1.5 })).toThrow();
});

it('Character.voice accepts new voice_settings', () => {
  const c = CharacterSchema.parse({
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Дэнни',
    voice: {
      tts_voice_id: 'rachel_v3',
      stability: 0.55,
      similarity_boost: 0.7,
      style: 0.1,
      speed: 1.0,
    },
  });
  expect(c.voice?.stability).toBe(0.55);
});

it('Character.voice strips legacy description field (back-compat)', () => {
  const c = CharacterSchema.parse({
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Дэнни',
    voice: {
      tts_voice_id: 'rachel_v3',
      description: 'тёплый, чуть низкий', // legacy F38 dead field
    },
  });
  expect(c.voice?.tts_voice_id).toBe('rachel_v3');
  // @ts-expect-error — description not in new type
  expect(c.voice?.description).toBeUndefined();
});
