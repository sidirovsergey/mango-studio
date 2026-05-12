import { describe, expect, it } from 'vitest';
import { buildSeedanceLitePrompt } from './seedance-lite';
import type { VideoPromptInput } from './types';

// ---------------------------------------------------------------------------
// Shared fixtures (mirrored from seedance-2.test.ts)
// ---------------------------------------------------------------------------

const baseFirstFrame = {
  kind: 'fal_passthrough' as const,
  url: 'https://fal.cdn/first-frame.png',
};

const fullScene10s: VideoPromptInput['scene'] = {
  scene_id: 's1',
  description: 'Рыжий кот смотрит в камеру на фоне городской улицы',
  description_en: 'A ginger cat looks into the camera against a city street backdrop',
  duration_sec: 10,
  dialogue: { speaker: 'Кот', text: 'I see you.' },
  composition: {
    shot_size: 'close_up',
    angle: 'eye_level',
    framing_notes: 'face fills frame',
    subject_focus: 'Кот',
  },
  camera_movement: {
    kind: 'dolly_in',
    speed: 'slow',
    lens_character: '85mm anamorphic',
  },
  lighting: {
    recipe: 'golden hour rim, soft fill from below',
    time_of_day: 'late afternoon',
    key_direction: 'back-right',
  },
  audio_direction: {
    music: 'sparse strings build',
    ambient: 'distant city hum',
    sfx: ['fabric rustle'],
    voice_notes: 'soft and curious',
  },
  arc_role: 'climax',
};

const fullVisualTheme: VideoPromptInput['visual_theme'] = {
  palette: ['#D4A96A', '#3B2F2F', '#E8DCC8'],
  lighting: 'golden hour natural',
  lens: 'anamorphic 85mm',
  motion: 'slow deliberate',
  mood: 'contemplative',
  film_look: 'Roger Deakins palette, warm amber grade, 24fps shallow DOF',
  avoid: ['camera shake', 'jump cuts', 'overexposure'],
};

function makeInput(overrides: Partial<VideoPromptInput> = {}): VideoPromptInput {
  return {
    model: 'bytedance/seedance-lite/image-to-video',
    scene: fullScene10s,
    first_frame_storage: baseFirstFrame,
    audio_mode: 'native',
    characters_in_scene: [
      {
        id: 'char-1',
        name: 'Кот',
        description: 'ginger tabby cat with green eyes',
      },
    ],
    visual_theme: fullVisualTheme,
    tier: 'premium',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Output shape
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — output shape', () => {
  it('returns VideoPromptOutput with correct shape', () => {
    const result = buildSeedanceLitePrompt(makeInput());
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('image_refs');
    expect(result).toHaveProperty('duration_sec', 10);
    expect(result).toHaveProperty('aspect_ratio', '9:16');
  });

  it('image_refs contains exactly [first_frame_storage]', () => {
    const result = buildSeedanceLitePrompt(makeInput());
    expect(result.image_refs).toHaveLength(1);
    expect(result.image_refs[0]).toEqual(baseFirstFrame);
  });

  it('prompt is a non-empty string', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. No [AUDIO] block — defining contract difference from Seedance 2.0
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — NO [AUDIO] block (has_native_audio === false)', () => {
  it('audio_mode=native: prompt does NOT contain [AUDIO]', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput({ audio_mode: 'native' }));
    expect(prompt).not.toContain('[AUDIO]');
  });

  it('audio_mode=native: prompt does NOT contain Music:, Ambient:, SFX:, Dialogue: lines', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput({ audio_mode: 'native' }));
    expect(prompt).not.toMatch(/^Music:/m);
    expect(prompt).not.toMatch(/^Ambient:/m);
    expect(prompt).not.toMatch(/^SFX:/m);
    expect(prompt).not.toMatch(/^Dialogue:/m);
  });

  it('audio_mode=silent_tts: prompt does NOT contain [AUDIO]', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput({ audio_mode: 'silent_tts' }));
    expect(prompt).not.toContain('[AUDIO]');
  });

  it('audio_mode=silent_tts: does NOT contain the F66 silent_tts string', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput({ audio_mode: 'silent_tts' }));
    expect(prompt).not.toContain('voice dubbed in post');
  });

  it('audio_mode=auto: prompt does NOT contain [AUDIO]', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput({ audio_mode: 'auto' }));
    expect(prompt).not.toContain('[AUDIO]');
  });

  it('dialogue non-null + music set: still NO audio block emitted (Lite ignores audio_mode and audio_direction)', () => {
    // This is the key contract test: even when all audio data is present,
    // Seedance Lite emits zero audio markup.
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        dialogue: { speaker: 'Герой', text: 'Do you hear that?' },
        audio_direction: {
          music: 'orchestral swell',
          ambient: 'forest birds',
          sfx: ['thunder crack', 'rain drops'],
          voice_notes: 'tense whisper',
        },
      },
    });
    const { prompt } = buildSeedanceLitePrompt(input);
    expect(prompt).not.toContain('[AUDIO]');
    expect(prompt).not.toContain('orchestral swell');
    expect(prompt).not.toContain('forest birds');
    expect(prompt).not.toContain('thunder crack');
    expect(prompt).not.toContain('"Do you hear that?"');
    expect(prompt).not.toContain('Dialogue:');
  });
});

// ---------------------------------------------------------------------------
// 3. All six expected blocks present
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — all required blocks present', () => {
  it('emits [SCENE] block', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('[SCENE]');
  });

  it('emits [SUBJECT] block', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('[SUBJECT]');
  });

  it('emits [ACTION] block', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('[ACTION]');
  });

  it('emits [CAMERA] block', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('[CAMERA]');
  });

  it('emits [Pacing/Style] block', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('[Pacing/Style]');
  });

  it('emits Avoid: line', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('Avoid:');
  });
});

// ---------------------------------------------------------------------------
// 4. Time-segment cardinality (Lite only supports 5s and 10s per spec)
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — time segments', () => {
  it('5s scene: single beat, NO time-segment prefix (no "0–" pattern)', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 5, dialogue: null },
    });
    const { prompt } = buildSeedanceLitePrompt(input);
    expect(prompt).toContain('[ACTION]');
    expect(prompt).not.toMatch(/0–\d+s:/);
  });

  it('10s scene: exactly three time-segment lines (0–3s:, 3–7s:, 7–10s:) using en-dash U+2013', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 10, dialogue: null },
    });
    const { prompt } = buildSeedanceLitePrompt(input);
    // en-dash U+2013 between numbers
    expect(prompt).toContain('0–3s:');
    expect(prompt).toContain('3–7s:');
    expect(prompt).toContain('7–10s:');
    const segmentMatches = prompt.match(/\d+–\d+s:/g) ?? [];
    expect(segmentMatches).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 5. Avoid: line always present
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — Avoid: line', () => {
  it('Avoid: present with custom list when visual_theme.avoid is set', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('Avoid:');
    expect(prompt).toContain('camera shake');
    expect(prompt).toContain('jump cuts');
  });

  it('Avoid: present with default list when visual_theme is absent', () => {
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildSeedanceLitePrompt(input);
    expect(prompt).toContain('Avoid:');
    expect(prompt).toContain('abrupt cuts');
    expect(prompt).toContain('scene changes');
    expect(prompt).toContain('lens flares masking faces');
  });

  it('Avoid: present with default list when visual_theme.avoid is empty', () => {
    const input = makeInput({
      visual_theme: { ...fullVisualTheme, avoid: [] },
    });
    const { prompt } = buildSeedanceLitePrompt(input);
    expect(prompt).toContain('Avoid:');
    expect(prompt).toContain('abrupt cuts');
  });
});

// ---------------------------------------------------------------------------
// 6. Block order regression test
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — block order', () => {
  it('blocks appear in order: [SCENE] → [SUBJECT] → [ACTION] → [CAMERA] → [Pacing/Style] → Avoid:', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    const sceneIdx = prompt.indexOf('[SCENE]');
    const subjectIdx = prompt.indexOf('[SUBJECT]');
    const actionIdx = prompt.indexOf('[ACTION]');
    const cameraIdx = prompt.indexOf('[CAMERA]');
    const pacingIdx = prompt.indexOf('[Pacing/Style]');
    const avoidIdx = prompt.indexOf('Avoid:');

    expect(sceneIdx).toBeGreaterThan(-1);
    expect(subjectIdx).toBeGreaterThan(sceneIdx);
    expect(actionIdx).toBeGreaterThan(subjectIdx);
    expect(cameraIdx).toBeGreaterThan(actionIdx);
    expect(pacingIdx).toBeGreaterThan(cameraIdx);
    expect(avoidIdx).toBeGreaterThan(pacingIdx);
  });

  it('[AUDIO] does NOT appear anywhere between any of the 6 blocks', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).not.toContain('[AUDIO]');
  });
});

// ---------------------------------------------------------------------------
// 7. @Image1 in [SUBJECT]
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — @Image1 in [SUBJECT]', () => {
  it('always references @Image1 with a character', () => {
    const { prompt } = buildSeedanceLitePrompt(makeInput());
    expect(prompt).toContain('@Image1');
    expect(prompt).toContain('Кот');
  });

  it('references @Image1 with no characters', () => {
    const input = makeInput({ characters_in_scene: [] });
    const { prompt } = buildSeedanceLitePrompt(input);
    expect(prompt).toContain('[SUBJECT]');
    expect(prompt).toContain('@Image1');
  });

  it('references @Image1 with multiple characters', () => {
    const input = makeInput({
      characters_in_scene: [
        { id: 'c1', name: 'Кот', description: 'ginger tabby cat' },
        { id: 'c2', name: 'Пёс', description: 'black labrador dog' },
      ],
    });
    const { prompt } = buildSeedanceLitePrompt(input);
    expect(prompt).toContain('@Image1');
    expect(prompt).toContain('Кот');
    expect(prompt).toContain('Пёс');
  });
});

// ---------------------------------------------------------------------------
// 8. Key contract: audio is ALWAYS ignored regardless of input data
// ---------------------------------------------------------------------------

describe('buildSeedanceLitePrompt — audio always ignored (key contract)', () => {
  it('no audio tokens regardless of audio_mode=native with full audio_direction', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        dialogue: { speaker: 'Кот', text: 'I see you.' },
        audio_direction: {
          music: 'sparse strings build',
          ambient: 'distant city hum',
          sfx: ['fabric rustle'],
          voice_notes: 'soft and curious',
        },
      },
    });
    const { prompt } = buildSeedanceLitePrompt(input);
    // None of these audio-related strings should appear
    expect(prompt).not.toContain('[AUDIO]');
    expect(prompt).not.toContain('Music:');
    expect(prompt).not.toContain('Ambient:');
    expect(prompt).not.toContain('SFX:');
    expect(prompt).not.toContain('Dialogue:');
    expect(prompt).not.toContain('sparse strings build');
    expect(prompt).not.toContain('distant city hum');
    expect(prompt).not.toContain('fabric rustle');
    expect(prompt).not.toContain('"I see you."');
    // But the non-audio blocks ARE present
    expect(prompt).toContain('[SCENE]');
    expect(prompt).toContain('[ACTION]');
    expect(prompt).toContain('[CAMERA]');
    expect(prompt).toContain('[Pacing/Style]');
    expect(prompt).toContain('Avoid:');
  });
});
