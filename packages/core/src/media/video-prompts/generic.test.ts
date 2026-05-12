import { describe, expect, it } from 'vitest';
import { CAMERA_VERB } from './_seedance-shared';
import { buildGenericVideoPrompt } from './generic';
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
    kind: 'tracking',
    speed: 'medium',
    lens_character: '35mm wide',
  },
  lighting: {
    recipe: 'golden hour rim',
    time_of_day: 'dusk',
    key_direction: 'back-right',
  },
  audio_direction: {
    music: 'sparse strings',
    ambient: 'distant city hum',
    sfx: ['fabric rustle'],
    voice_notes: 'soft and curious',
  },
  arc_role: 'climax',
};

function makeInput(overrides: Partial<VideoPromptInput> = {}): VideoPromptInput {
  return {
    model: 'some-unknown/model-v1',
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

describe('buildGenericVideoPrompt — output shape', () => {
  it('returns VideoPromptOutput with correct shape', () => {
    const out = buildGenericVideoPrompt(makeInput());
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
// 2. Plain prose — no labels
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — no labels', () => {
  it('does not contain "Description:", "Camera:", or "Audio:" labels', () => {
    const out = buildGenericVideoPrompt(makeInput());
    expect(out.prompt).not.toContain('Description:');
    expect(out.prompt).not.toContain('Camera:');
    expect(out.prompt).not.toContain('Audio:');
  });
});

// ---------------------------------------------------------------------------
// 3. No [BLOCK] headers
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — no block headers', () => {
  it('does not contain [SCENE], [CINEMATOGRAPHY], [ACTION], etc.', () => {
    const out = buildGenericVideoPrompt(makeInput());
    const blockHeaderPattern =
      /\[SCENE\]|\[CINEMATOGRAPHY\]|\[ACTION\]|\[SUBJECT\]|\[CAMERA\]|\[PACING\]/;
    expect(out.prompt).not.toMatch(blockHeaderPattern);
  });
});

// ---------------------------------------------------------------------------
// 4. description_en used when present; fallback to description
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — description fallback', () => {
  it('uses description_en when present', () => {
    const out = buildGenericVideoPrompt(makeInput());
    expect(out.prompt).toContain('A ginger cat slowly looks toward the horizon on a city street');
    expect(out.prompt).not.toContain('Рыжий кот');
  });

  it('falls back to description when description_en absent', () => {
    const input = makeInput({
      scene: { ...fullScene8s, description_en: undefined },
    });
    const out = buildGenericVideoPrompt(input);
    expect(out.prompt).toContain('Рыжий кот медленно смотрит в горизонт');
  });
});

// ---------------------------------------------------------------------------
// 5. Camera line present with verb + speed + lens
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — camera line', () => {
  it('contains verb, speed, and lens in camera paragraph', () => {
    const out = buildGenericVideoPrompt(makeInput());
    expect(out.prompt).toContain('Tracking');
    expect(out.prompt).toContain('medium');
    expect(out.prompt).toContain('35mm wide');
  });

  // 6. Static framing when camera_movement absent
  it('emits "Static framing." when camera_movement absent', () => {
    const input = makeInput({
      scene: { ...fullScene8s, camera_movement: undefined },
    });
    const out = buildGenericVideoPrompt(input);
    expect(out.prompt).toContain('Static framing.');
  });
});

// ---------------------------------------------------------------------------
// 7. Audio paragraph emitted when audio_direction present and mode != silent_tts
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — audio paragraph', () => {
  it('emits audio paragraph when audio_direction present and mode is native', () => {
    const out = buildGenericVideoPrompt(makeInput({ audio_mode: 'native' }));
    // Should contain some audio info (ambient or music or sfx)
    expect(out.prompt).toContain('distant city hum');
  });

  // 8. Audio paragraph OMITTED when audio_direction absent
  it('omits audio paragraph when audio_direction absent', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene8s, audio_direction: undefined },
    });
    const out = buildGenericVideoPrompt(input);
    // Should be just 2 paragraphs (description + camera), so no third paragraph
    const paragraphs = out.prompt.split('\n\n').filter((p) => p.trim().length > 0);
    expect(paragraphs).toHaveLength(2);
  });

  // 9. Audio paragraph OMITTED when audio_mode === 'silent_tts'
  it('omits audio paragraph when audio_mode is silent_tts', () => {
    const input = makeInput({ audio_mode: 'silent_tts' });
    const out = buildGenericVideoPrompt(input);
    // Should be just 2 paragraphs (description + camera)
    const paragraphs = out.prompt.split('\n\n').filter((p) => p.trim().length > 0);
    expect(paragraphs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 10. No dialogue ever rendered
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — no dialogue', () => {
  it('does not render dialogue even with English text and native mode', () => {
    const out = buildGenericVideoPrompt(makeInput({ audio_mode: 'native' }));
    expect(out.prompt).not.toContain('Dialogue:');
    expect(out.prompt).not.toContain('I see you.');
  });
});

// ---------------------------------------------------------------------------
// 11. No @Image1 reference in prompt text
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — no @Image1', () => {
  it('does not contain "@Image1" in prompt text', () => {
    const out = buildGenericVideoPrompt(makeInput());
    expect(out.prompt).not.toContain('@Image1');
  });
});

// ---------------------------------------------------------------------------
// 12. All 14 camera_movement verbs (parametric)
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — all 14 camera_movement verbs', () => {
  const allVerbs = Object.keys(CAMERA_VERB) as Array<keyof typeof CAMERA_VERB>;

  it.each(allVerbs)('verb "%s" appears in camera paragraph', (kind) => {
    const input = makeInput({
      scene: {
        ...fullScene8s,
        camera_movement: { kind, speed: 'medium' },
      },
    });
    const out = buildGenericVideoPrompt(input);
    expect(out.prompt).toContain(CAMERA_VERB[kind]);
  });
});

// ---------------------------------------------------------------------------
// 13. Block-order regression: description → camera → (optional) audio
// ---------------------------------------------------------------------------

describe('buildGenericVideoPrompt — section order', () => {
  it('emits sections in order: description → camera → audio', () => {
    const out = buildGenericVideoPrompt(makeInput({ audio_mode: 'native' }));
    const paragraphs = out.prompt.split('\n\n').filter((p) => p.trim().length > 0);
    // First paragraph is description
    expect(paragraphs[0]).toContain('A ginger cat');
    // Second paragraph contains camera info (Tracking)
    expect(paragraphs[1]).toContain('Tracking');
    // Third paragraph is audio (ambient or music)
    expect(paragraphs[2]).toBeDefined();
  });

  it('description appears before camera (index check)', () => {
    const out = buildGenericVideoPrompt(makeInput({ audio_mode: 'native' }));
    const descIdx = out.prompt.indexOf('A ginger cat');
    const cameraIdx = out.prompt.indexOf('Tracking');
    expect(descIdx).toBeLessThan(cameraIdx);
  });
});
