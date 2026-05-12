import { describe, expect, it } from 'vitest';
import { buildFirstFramePrompt, buildVoicePrompt } from './video-prompts';

// NOTE: buildFirstFramePrompt has moved to image-prompts/first-frame.ts (T4 refactor).
// These legacy tests remain here for backward-compat verification (the function is still
// re-exported from video-prompts.ts). The API now uses Style enum ('3d_pixar') not a string.

const dolphin = {
  id: 'c1',
  name: 'Дельфин',
  description: 'Главный герой, оптимистичный дельфин',
  full_prompt: 'A blue 3D Pixar dolphin character with bowtie',
  dossier: {
    storage: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/dolphin.png' },
    reference_image: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/dolphin-ref.png' },
    model: 'm',
    format: '16:9' as const,
    quality: '1080p' as const,
    generated_at: '2026-01-01',
  },
  voice: {},
};

const crab = {
  id: 'c2',
  name: 'Краб',
  description: 'Крабик с ноутбуком',
  full_prompt: '',
  dossier: {
    storage: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/crab.png' },
    reference_image: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/crab-ref.png' },
    model: 'm',
    format: '16:9' as const,
    quality: '1080p' as const,
    generated_at: '2026-01-01',
  },
  voice: {},
};

describe('buildFirstFramePrompt', () => {
  it('composes prompt with style + characters + description', () => {
    const result = buildFirstFramePrompt({
      scene: {
        scene_id: 's1',
        description: 'Дельфин говорит с крабом на пляже',
      },
      characters_in_scene: [dolphin, crab],
      prev_last_frame: null,
      project_style: '3d_pixar',
      first_frame_source: 'manual_text2img',
    });
    // New preamble contains 'Pixar' (from STYLE_PREAMBLE[3d_pixar])
    expect(result.prompt).toContain('Pixar');
    expect(result.prompt).toContain('9:16');
    expect(result.prompt).toContain('Дельфин говорит с крабом');
    // image_refs now uses reference_image (not dossier.storage)
    expect(result.image_refs).toHaveLength(2);
  });

  it('puts continuity ref first when auto_continuity', () => {
    const last_frame = {
      kind: 'fal_passthrough' as const,
      url: 'https://fal.cdn/lastframe.png',
    };
    const result = buildFirstFramePrompt({
      scene: { scene_id: 's2', description: 'продолжение' },
      characters_in_scene: [dolphin],
      prev_last_frame: last_frame,
      project_style: '3d_pixar',
      first_frame_source: 'auto_continuity',
    });
    expect(result.image_refs[0]).toEqual(last_frame);
    // Second ref is the reference_image (not dossier.storage)
    expect(result.image_refs[1]).toEqual(dolphin.dossier.reference_image);
  });

  it('skips continuity ref when first_frame_source = manual_text2img', () => {
    const last_frame = {
      kind: 'fal_passthrough' as const,
      url: 'https://fal.cdn/lastframe.png',
    };
    const result = buildFirstFramePrompt({
      scene: { scene_id: 's2', description: 'cut' },
      characters_in_scene: [dolphin],
      prev_last_frame: last_frame,
      project_style: '3d_pixar',
      first_frame_source: 'manual_text2img',
    });
    expect(result.image_refs).toHaveLength(1);
    expect(result.image_refs[0]).toEqual(dolphin.dossier.reference_image);
  });

  it('caps refs at 5 (nano-banana limit)', () => {
    const many = [
      dolphin,
      crab,
      { ...dolphin, id: 'c3' },
      { ...dolphin, id: 'c4' },
      { ...dolphin, id: 'c5' },
      { ...dolphin, id: 'c6' },
    ];
    const result = buildFirstFramePrompt({
      scene: { scene_id: 's1', description: 'crowd' },
      characters_in_scene: many,
      prev_last_frame: null,
      project_style: '3d_pixar',
      first_frame_source: 'manual_text2img',
    });
    expect(result.image_refs).toHaveLength(5);
  });
});

// NOTE: buildVideoPrompt tests have been removed. The function is now a re-export
// from packages/core/src/media/video-prompts/index.ts (the per-engine dispatcher).
// Each per-engine builder has its own thorough test suite in video-prompts/*.test.ts,
// and the dispatcher has its own test. Testing the old declarative contract here
// would duplicate those tests and cover a contract that no longer exists.

describe('buildVoicePrompt', () => {
  it('uses character voice_id when speaker is character', () => {
    const result = buildVoicePrompt({
      dialogue: { speaker: 'c1', text: 'Привет' },
      narrator_voice: { tts_voice_id: 'narr-default' },
      character: { ...dolphin, voice: { tts_voice_id: 'char-dolphin' } },
    });
    expect(result.voice_id).toBe('char-dolphin');
    expect(result.text).toBe('Привет');
  });

  it('falls back to narrator voice when character has no voice_id', () => {
    const result = buildVoicePrompt({
      dialogue: { speaker: 'c1', text: 'Привет' },
      narrator_voice: { tts_voice_id: 'narr-default' },
      character: { ...dolphin, voice: undefined },
    });
    expect(result.voice_id).toBe('narr-default');
    expect(result.fallback).toBe(true);
  });

  it('uses narrator voice when speaker = narrator', () => {
    const result = buildVoicePrompt({
      dialogue: { speaker: 'narrator', text: 'Once upon...' },
      narrator_voice: { tts_voice_id: 'narr-default' },
      character: null,
    });
    expect(result.voice_id).toBe('narr-default');
  });
});
