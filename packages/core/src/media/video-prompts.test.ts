import { describe, it, expect } from 'vitest';
import { buildFirstFramePrompt, buildVideoPrompt, buildVoicePrompt } from './video-prompts';

const dolphin = {
  id: 'c1',
  name: 'Дельфин',
  description: 'Главный герой, оптимистичный дельфин',
  full_prompt: 'A blue 3D Pixar dolphin character with bowtie',
  dossier: {
    storage: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/dolphin.png' },
  },
  reference_images: [],
};

const crab = {
  ...dolphin,
  id: 'c2',
  name: 'Краб',
  description: 'Крабик с ноутбуком',
  dossier: {
    storage: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/crab.png' },
  },
};

describe('buildFirstFramePrompt', () => {
  it('composes prompt with style + composition + characters + description', () => {
    const result = buildFirstFramePrompt({
      scene: {
        scene_id: 's1',
        description: 'Дельфин говорит с крабом на пляже',
        composition_hint: 'wide shot, обоих видно',
      },
      characters_in_scene: [dolphin, crab],
      prev_last_frame: null,
      project_style: '3D Pixar',
      first_frame_source: 'manual_text2img',
    });
    expect(result.prompt).toContain('3D Pixar');
    expect(result.prompt).toContain('9:16');
    expect(result.prompt).toContain('Дельфин говорит с крабом');
    expect(result.prompt).toContain('wide shot');
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
      project_style: '3D Pixar',
      first_frame_source: 'auto_continuity',
    });
    expect(result.image_refs[0]).toEqual(last_frame);
    expect(result.image_refs[1]).toEqual(dolphin.dossier.storage);
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
      project_style: '3D Pixar',
      first_frame_source: 'manual_text2img',
    });
    expect(result.image_refs).toHaveLength(1);
    expect(result.image_refs[0]).toEqual(dolphin.dossier.storage);
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
      project_style: 'flat',
      first_frame_source: 'manual_text2img',
    });
    expect(result.image_refs).toHaveLength(5);
  });
});

describe('buildVideoPrompt', () => {
  it('image-to-video prompt with single ref + duration (silent model omits dialogue)', () => {
    const result = buildVideoPrompt({
      scene: {
        scene_id: 's1',
        description: 'Дельфин машет плавником',
        duration_sec: 8,
        dialogue: { speaker: 'narrator', text: 'Once upon a time' },
      },
      first_frame_storage: { kind: 'fal_passthrough', url: 'https://fal.cdn/ff.png' },
      model: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    });
    expect(result.image_refs).toHaveLength(1);
    expect(result.duration_sec).toBe(8);
    expect(result.aspect_ratio).toBe('9:16');
    expect(result.prompt).toContain('Дельфин машет');
    // Silent model — dialogue NOT in prompt
    expect(result.prompt).not.toContain('Once upon a time');
  });

  it('includes dialogue in prompt for native-audio model', () => {
    const result = buildVideoPrompt({
      scene: {
        scene_id: 's1',
        description: 'Дельфин говорит',
        duration_sec: 8,
        dialogue: { speaker: 'narrator', text: 'Hello world' },
      },
      first_frame_storage: { kind: 'fal_passthrough', url: 'https://fal.cdn/ff.png' },
      model: 'bytedance/seedance-2.0/image-to-video',
    });
    expect(result.prompt).toContain('Hello world');
  });
});

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
