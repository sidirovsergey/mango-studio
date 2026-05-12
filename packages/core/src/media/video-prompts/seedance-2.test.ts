import { describe, expect, it } from 'vitest';
import { buildSeedance2Prompt } from './seedance-2';
import type { VideoPromptInput } from './types';

// ---------------------------------------------------------------------------
// Shared fixtures
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
    model: 'bytedance/seedance-2.0/image-to-video',
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
// 1. Basic 10s structured scene — all blocks present with correct content
// ---------------------------------------------------------------------------

describe('buildSeedance2Prompt — basic 10s structured scene', () => {
  it('returns VideoPromptOutput with correct shape', () => {
    const result = buildSeedance2Prompt(makeInput());
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('image_refs');
    expect(result).toHaveProperty('duration_sec', 10);
    expect(result).toHaveProperty('aspect_ratio', '9:16');
  });

  it('image_refs contains exactly [first_frame_storage]', () => {
    const result = buildSeedance2Prompt(makeInput());
    expect(result.image_refs).toHaveLength(1);
    expect(result.image_refs[0]).toEqual(baseFirstFrame);
  });

  it('emits [SCENE] block with lighting recipe', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('[SCENE]');
    expect(prompt).toContain('golden hour rim, soft fill from below');
  });

  it('emits [SCENE] block with content from description_en', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('ginger cat');
  });

  it('emits [SUBJECT] block with character name, description, and @Image1', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('[SUBJECT]');
    expect(prompt).toContain('Кот');
    expect(prompt).toContain('ginger tabby cat with green eyes');
    expect(prompt).toContain('@Image1');
  });

  it('emits [ACTION] block', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('[ACTION]');
  });

  it('emits [CAMERA] block with Dolly In, slow, 85mm anamorphic, Close Up, eye level', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('[CAMERA]');
    expect(prompt).toContain('Dolly In');
    expect(prompt).toContain('slow');
    expect(prompt).toContain('85mm anamorphic');
    expect(prompt).toContain('Close Up');
    expect(prompt).toContain('Eye Level');
  });

  it('emits [AUDIO] block with music + ambient + sfx + dialogue (native mode)', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('[AUDIO]');
    expect(prompt).toContain('sparse strings build');
    expect(prompt).toContain('distant city hum');
    expect(prompt).toContain('fabric rustle');
    expect(prompt).toContain('Dialogue:');
    expect(prompt).toContain('Кот');
    expect(prompt).toContain('"I see you."');
  });

  it('emits [Pacing/Style] block with film_look from visual_theme', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('[Pacing/Style]');
    expect(prompt).toContain('Roger Deakins palette');
  });

  it('emits Avoid: line with custom avoid list from visual_theme', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('Avoid:');
    expect(prompt).toContain('camera shake');
    expect(prompt).toContain('jump cuts');
    expect(prompt).toContain('overexposure');
  });

  it('blocks are in the correct order: [SCENE] → [SUBJECT] → [ACTION] → [CAMERA] → [AUDIO] → [Pacing/Style] → Avoid:', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    const sceneIdx = prompt.indexOf('[SCENE]');
    const subjectIdx = prompt.indexOf('[SUBJECT]');
    const actionIdx = prompt.indexOf('[ACTION]');
    const cameraIdx = prompt.indexOf('[CAMERA]');
    const audioIdx = prompt.indexOf('[AUDIO]');
    const pacingIdx = prompt.indexOf('[Pacing/Style]');
    const avoidIdx = prompt.indexOf('Avoid:');
    expect(sceneIdx).toBeGreaterThan(-1);
    expect(subjectIdx).toBeGreaterThan(sceneIdx);
    expect(actionIdx).toBeGreaterThan(subjectIdx);
    expect(cameraIdx).toBeGreaterThan(actionIdx);
    expect(audioIdx).toBeGreaterThan(cameraIdx);
    expect(pacingIdx).toBeGreaterThan(audioIdx);
    expect(avoidIdx).toBeGreaterThan(pacingIdx);
  });
});

// ---------------------------------------------------------------------------
// 2. Time-segment cardinality
// ---------------------------------------------------------------------------

describe('buildSeedance2Prompt — time-segment cardinality', () => {
  it('5s scene: single beat, NO time-segment prefixes (no "0–")', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 5, dialogue: null },
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('[ACTION]');
    // Should NOT contain time-segment format
    expect(prompt).not.toMatch(/0–\d+s:/);
  });

  it('7s scene: exactly two time-segment lines', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 7, dialogue: null },
    });
    const { prompt } = buildSeedance2Prompt(input);
    const segmentMatches = prompt.match(/\d+–\d+s:/g) ?? [];
    expect(segmentMatches).toHaveLength(2);
  });

  it('10s scene: exactly three time-segment lines (0–3s:, 3–7s:, 7–10s:)', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 10, dialogue: null },
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('0–3s:');
    expect(prompt).toContain('3–7s:');
    expect(prompt).toContain('7–10s:');
    const segmentMatches = prompt.match(/\d+–\d+s:/g) ?? [];
    expect(segmentMatches).toHaveLength(3);
  });

  it('12s scene: exactly three time-segment lines (0–4s:, 4–8s:, 8–12s:)', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 12, dialogue: null },
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('0–4s:');
    expect(prompt).toContain('4–8s:');
    expect(prompt).toContain('8–12s:');
    const segmentMatches = prompt.match(/\d+–\d+s:/g) ?? [];
    expect(segmentMatches).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Audio mode variants
// ---------------------------------------------------------------------------

describe('buildSeedance2Prompt — audio_mode variants', () => {
  it('silent_tts: emits exact F66 string; NO music, NO sfx, NO dialogue lines', () => {
    const input = makeInput({ audio_mode: 'silent_tts' });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('[AUDIO]');
    expect(prompt).toContain(
      'No dialogue, no music; ambient room tone only — voice dubbed in post',
    );
    expect(prompt).not.toContain('sparse strings build');
    expect(prompt).not.toContain('fabric rustle');
    expect(prompt).not.toContain('Dialogue:');
  });

  it('silent_tts: does NOT emit dialogue even if scene.dialogue is non-null', () => {
    // scene has dialogue: { speaker: 'Кот', text: 'I see you.' }
    const input = makeInput({ audio_mode: 'silent_tts' });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).not.toContain('"I see you."');
  });

  it('native + no dialogue: music/ambient/sfx present, no Dialogue: line', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene10s, dialogue: null },
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('sparse strings build');
    expect(prompt).toContain('distant city hum');
    expect(prompt).toContain('fabric rustle');
    expect(prompt).not.toContain('Dialogue:');
  });

  it('native + dialogue: Dialogue: <speaker> — "<text>" format', () => {
    const input = makeInput({ audio_mode: 'native' });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toMatch(/Dialogue:\s*Кот\s*—\s*"I see you\."/);
  });

  it('auto mode: behaves like native (music/ambient/sfx present)', () => {
    const input = makeInput({ audio_mode: 'auto' });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('sparse strings build');
    expect(prompt).toContain('distant city hum');
  });
});

// ---------------------------------------------------------------------------
// 4. Visual theme / avoid list
// ---------------------------------------------------------------------------

describe('buildSeedance2Prompt — visual_theme.avoid override', () => {
  it('uses custom avoid list when visual_theme.avoid is set', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    // Custom list from fullVisualTheme
    expect(prompt).toContain('camera shake');
    expect(prompt).toContain('jump cuts');
    // Default list items should NOT appear since custom overrides
    expect(prompt).not.toContain('lens flares masking faces');
  });

  it('uses default avoid list when visual_theme is absent', () => {
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('abrupt cuts');
    expect(prompt).toContain('scene changes');
    expect(prompt).toContain('lens flares masking faces');
    expect(prompt).toContain('multiple disconnected vignettes');
    expect(prompt).toContain('text overlays');
  });

  it('uses default avoid list when visual_theme.avoid is empty array', () => {
    const input = makeInput({
      visual_theme: { ...fullVisualTheme, avoid: [] },
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('abrupt cuts');
    expect(prompt).toContain('lens flares masking faces');
  });

  it('uses default film_look fallback when visual_theme.film_look is absent', () => {
    const input = makeInput({
      visual_theme: { ...fullVisualTheme, film_look: undefined },
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('[Pacing/Style]');
    // Should have some content (fallback phrase)
    const pacingIdx = prompt.indexOf('[Pacing/Style]');
    const avoidIdx = prompt.indexOf('Avoid:');
    const pacingContent = prompt.slice(pacingIdx, avoidIdx).trim();
    expect(pacingContent.length).toBeGreaterThan('[Pacing/Style]'.length);
  });

  it('uses default pacing fallback when visual_theme is absent entirely', () => {
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('[Pacing/Style]');
  });
});

// ---------------------------------------------------------------------------
// 5. Camera movement edge cases
// ---------------------------------------------------------------------------

describe('buildSeedance2Prompt — camera movement edge cases', () => {
  it('missing camera_movement: emits Static in [CAMERA] block', () => {
    const input = makeInput({
      scene: { ...fullScene10s, camera_movement: undefined },
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('[CAMERA]');
    expect(prompt).toContain('Static');
  });

  it('maps all 14 camera movement kinds to Title Case verbs', () => {
    const cases: Array<[string, string]> = [
      ['static', 'Static'],
      ['dolly_in', 'Dolly In'],
      ['dolly_out', 'Dolly Out'],
      ['pan_left', 'Pan Left'],
      ['pan_right', 'Pan Right'],
      ['tilt_up', 'Tilt Up'],
      ['tilt_down', 'Tilt Down'],
      ['tracking', 'Tracking'],
      ['orbit', 'Orbit'],
      ['crane_up', 'Crane Up'],
      ['crane_down', 'Crane Down'],
      ['whip_pan', 'Whip Pan'],
      ['handheld', 'Handheld'],
      ['pov_walk', 'POV Walk'],
    ];

    for (const [kind, expectedVerb] of cases) {
      const input = makeInput({
        scene: {
          ...fullScene10s,
          camera_movement: {
            kind: kind as VideoPromptInput['scene']['camera_movement'] extends { kind: infer K }
              ? K
              : never,
            speed: 'medium',
          },
        },
      });
      const { prompt } = buildSeedance2Prompt(input);
      expect(prompt, `kind "${kind}" should produce "${expectedVerb}"`).toContain(expectedVerb);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Subject block edge cases
// ---------------------------------------------------------------------------

describe('buildSeedance2Prompt — [SUBJECT] block edge cases', () => {
  it('no characters_in_scene: references @Image1 only', () => {
    const input = makeInput({ characters_in_scene: [] });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('[SUBJECT]');
    expect(prompt).toContain('@Image1');
  });

  it('no characters_in_scene (undefined): references @Image1 only', () => {
    const input = makeInput({ characters_in_scene: undefined });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('@Image1');
  });

  it('multiple characters: lists all names + descriptions + @Image1', () => {
    const input = makeInput({
      characters_in_scene: [
        { id: 'c1', name: 'Кот', description: 'ginger tabby cat' },
        { id: 'c2', name: 'Пёс', description: 'black labrador dog' },
      ],
    });
    const { prompt } = buildSeedance2Prompt(input);
    expect(prompt).toContain('Кот');
    expect(prompt).toContain('ginger tabby cat');
    expect(prompt).toContain('Пёс');
    expect(prompt).toContain('black labrador dog');
    expect(prompt).toContain('@Image1');
  });
});

// ---------------------------------------------------------------------------
// 7. description_en fallback
// ---------------------------------------------------------------------------

describe('buildSeedance2Prompt — description fallback', () => {
  it('uses description_en when present', () => {
    const { prompt } = buildSeedance2Prompt(makeInput());
    expect(prompt).toContain('ginger cat looks into the camera');
  });

  it('falls back to description when description_en is absent', () => {
    const input = makeInput({
      scene: { ...fullScene10s, description_en: undefined },
    });
    const { prompt } = buildSeedance2Prompt(input);
    // Falls back to Russian description
    expect(prompt).toContain('Рыжий кот');
  });
});
