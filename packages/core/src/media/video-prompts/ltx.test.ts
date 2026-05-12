import { describe, expect, it } from 'vitest';
import { CAMERA_VERB } from './_seedance-shared';
import { buildLtxPrompt } from './ltx';
import type { VideoPromptInput } from './types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseFirstFrame = {
  kind: 'fal_passthrough' as const,
  url: 'https://fal.cdn/first-frame.png',
};

const fullScene8s: VideoPromptInput['scene'] = {
  scene_id: 's1',
  description: 'Рыжий кот медленно смотрит в горизонт на городской улице',
  description_en: 'A ginger cat slowly looks toward the horizon on a city street',
  duration_sec: 8,
  dialogue: { speaker: 'Cat', text: 'I see you.' },
  composition: {
    shot_size: 'close_up',
    angle: 'eye_level',
    framing_notes: 'face fills frame',
    subject_focus: 'Cat',
  },
  camera_movement: {
    kind: 'dolly_in',
    speed: 'slow',
    lens_character: '85mm anamorphic',
  },
  lighting: {
    recipe: 'golden hour rim',
    time_of_day: 'dusk',
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

function makeInput(overrides: Partial<VideoPromptInput> = {}): VideoPromptInput {
  return {
    model: 'fal-ai/ltx-video',
    scene: fullScene8s,
    first_frame_storage: baseFirstFrame,
    audio_mode: 'native',
    characters_in_scene: [
      {
        id: 'char-1',
        name: 'Cat',
        description: 'ginger tabby cat with green eyes, sharp gaze',
      },
    ],
    tier: 'premium',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Shape correct
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — output shape', () => {
  it('returns VideoPromptOutput with correct shape', () => {
    const out = buildLtxPrompt(makeInput());
    expect(out).toHaveProperty('prompt');
    expect(out).toHaveProperty('image_refs');
    expect(out).toHaveProperty('duration_sec');
    expect(out).toHaveProperty('aspect_ratio');
    expect(out.image_refs).toEqual([baseFirstFrame]);
    expect(out.duration_sec).toBe(8);
    expect(out.aspect_ratio).toBe('9:16');
    expect(typeof out.prompt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 2. Description: label present with description_en content
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — Description section', () => {
  it('emits "Description:" label with description_en content', () => {
    const out = buildLtxPrompt(makeInput());
    expect(out.prompt).toContain('Description:');
    expect(out.prompt).toContain('A ginger cat slowly looks toward the horizon on a city street');
  });

  // 3. Falls back to description when description_en absent
  it('falls back to description (Russian) when description_en absent', () => {
    const input = makeInput({
      scene: { ...fullScene8s, description_en: undefined },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).toContain('Description:');
    expect(out.prompt).toContain('Рыжий кот медленно смотрит в горизонт');
  });
});

// ---------------------------------------------------------------------------
// 4. Camera: label present with verb + speed + lens
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — Camera section', () => {
  it('emits "Camera:" label with verb, speed, and lens', () => {
    const out = buildLtxPrompt(makeInput());
    expect(out.prompt).toContain('Camera:');
    expect(out.prompt).toContain('Dolly In');
    expect(out.prompt).toContain('slow');
    expect(out.prompt).toContain('85mm anamorphic');
  });

  // 5. Camera: Static when camera_movement absent
  it('emits "Camera: Static" when camera_movement absent', () => {
    const input = makeInput({
      scene: { ...fullScene8s, camera_movement: undefined },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).toMatch(/Camera: Static/);
  });
});

// ---------------------------------------------------------------------------
// 6. Audio: label present in all branches
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — Audio section present', () => {
  it('always has "Audio:" label with native audio', () => {
    const out = buildLtxPrompt(makeInput({ audio_mode: 'native' }));
    expect(out.prompt).toContain('Audio:');
  });

  it('always has "Audio:" label with silent_tts', () => {
    const out = buildLtxPrompt(makeInput({ audio_mode: 'silent_tts' }));
    expect(out.prompt).toContain('Audio:');
  });

  it('always has "Audio:" label when audio_direction absent', () => {
    const input = makeInput({
      scene: { ...fullScene8s, audio_direction: undefined },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).toContain('Audio:');
  });
});

// ---------------------------------------------------------------------------
// 7. silent_tts → "Audio: silent, voice dubbed in post"
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — silent_tts audio mode', () => {
  it('emits "Audio: silent, voice dubbed in post" for silent_tts', () => {
    const out = buildLtxPrompt(makeInput({ audio_mode: 'silent_tts' }));
    expect(out.prompt).toContain('Audio: silent, voice dubbed in post');
  });
});

// ---------------------------------------------------------------------------
// 8. native + English dialogue → dialogue rendered with em-dash U+2014
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — dialogue rendering', () => {
  it('renders English dialogue with em-dash U+2014 in native mode', () => {
    const out = buildLtxPrompt(makeInput({ audio_mode: 'native' }));
    // scene has dialogue: { speaker: 'Cat', text: 'I see you.' }
    expect(out.prompt).toContain('Dialogue:');
    expect(out.prompt).toContain('—'); // em-dash U+2014
    expect(out.prompt).toContain('Cat');
    expect(out.prompt).toContain('I see you.');
  });

  // 9. native + Cyrillic dialogue → no dialogue line
  it('skips dialogue when text is Cyrillic (native mode)', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene8s,
        dialogue: { speaker: 'Кот', text: 'Я вижу тебя.' },
      },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).not.toContain('Dialogue:');
  });

  // 9b. lowercase-only Cyrillic dialogue → no dialogue line (gate fires on U+0440–U+044F)
  it('skips dialogue when text is lowercase Cyrillic only (native mode)', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene8s, dialogue: { speaker: 'Cat', text: 'я вижу тебя.' } },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).not.toContain('Dialogue:');
  });

  // 10. auto + English ASCII dialogue → dialogue rendered with em-dash U+2014
  it('renders English dialogue with em-dash U+2014 in auto mode', () => {
    const out = buildLtxPrompt(makeInput({ audio_mode: 'auto' }));
    // scene has dialogue: { speaker: 'Cat', text: 'I see you.' }
    expect(out.prompt).toContain('Dialogue:');
    expect(out.prompt).toContain('—'); // em-dash U+2014
    expect(out.prompt).toContain('Cat');
    expect(out.prompt).toContain('I see you.');
  });

  // 11. auto + Cyrillic dialogue → no dialogue line (Cyrillic gate applies under auto)
  it('skips dialogue when text is Cyrillic (auto mode)', () => {
    const input = makeInput({
      audio_mode: 'auto',
      scene: {
        ...fullScene8s,
        dialogue: { speaker: 'Кот', text: 'Я вижу тебя.' },
      },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).not.toContain('Dialogue:');
  });
});

// ---------------------------------------------------------------------------
// 10. audio_direction absent → "Audio: ambient naturalistic tone"
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — absent audio_direction fallback', () => {
  it('emits "Audio: ambient naturalistic tone" when audio_direction absent', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene8s, audio_direction: undefined },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).toContain('Audio: ambient naturalistic tone');
  });
});

// ---------------------------------------------------------------------------
// 11. No [BLOCK] headers anywhere
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — no block headers', () => {
  it('does not contain [SCENE], [CINEMATOGRAPHY], [ACTION], [CAMERA], etc.', () => {
    const out = buildLtxPrompt(makeInput());
    const blockHeaderPattern =
      /\[SCENE\]|\[CINEMATOGRAPHY\]|\[ACTION\]|\[SUBJECT\]|\[CAMERA\]|\[PACING\]/;
    expect(out.prompt).not.toMatch(blockHeaderPattern);
  });
});

// ---------------------------------------------------------------------------
// 12. All 14 camera_movement verbs (parametric)
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — all 14 camera_movement verbs', () => {
  const allVerbs = Object.keys(CAMERA_VERB) as Array<keyof typeof CAMERA_VERB>;

  it.each(allVerbs)('verb "%s" is rendered in Camera line', (kind) => {
    const input = makeInput({
      scene: {
        ...fullScene8s,
        camera_movement: { kind, speed: 'medium' },
      },
    });
    const out = buildLtxPrompt(input);
    expect(out.prompt).toContain('Camera:');
    expect(out.prompt).toContain(CAMERA_VERB[kind]);
  });
});

// ---------------------------------------------------------------------------
// 13. Block-order regression: Description → Camera → Audio
// ---------------------------------------------------------------------------

describe('buildLtxPrompt — block order', () => {
  it('emits sections in order: Description → Camera → Audio', () => {
    const out = buildLtxPrompt(makeInput({ audio_mode: 'native' }));
    const descIdx = out.prompt.indexOf('Description:');
    const camIdx = out.prompt.indexOf('Camera:');
    const audioIdx = out.prompt.indexOf('Audio:');
    expect(descIdx).toBeGreaterThanOrEqual(0);
    expect(camIdx).toBeGreaterThan(descIdx);
    expect(audioIdx).toBeGreaterThan(camIdx);
  });
});
