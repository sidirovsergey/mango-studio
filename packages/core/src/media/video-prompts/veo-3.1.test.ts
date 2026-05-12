import { describe, expect, it } from 'vitest';
import type { VideoPromptInput } from './types';
import { buildVeo31Prompt } from './veo-3.1';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseFirstFrame = {
  kind: 'fal_passthrough' as const,
  url: 'https://fal.cdn/first-frame.png',
};

/** Full-featured 8s scene with all optional fields set */
const fullScene8s: VideoPromptInput['scene'] = {
  scene_id: 's1',
  description: 'Рыжий кот медленно смотрит в горизонт на городской улице',
  description_en: 'A ginger cat slowly looks toward the horizon on a city street',
  duration_sec: 8,
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

const fullVisualTheme: VideoPromptInput['visual_theme'] = {
  palette: ['#D4A96A', '#3B2F2F', '#E8DCC8'],
  lighting: 'golden hour natural',
  lens: '85mm anamorphic',
  motion: 'slow handheld',
  mood: 'contemplative',
  film_look: 'anamorphic noir',
  avoid: ['camera shake', 'jump cuts', 'overexposure'],
};

function makeInput(overrides: Partial<VideoPromptInput> = {}): VideoPromptInput {
  return {
    model: 'google/veo-3.1',
    scene: fullScene8s,
    first_frame_storage: baseFirstFrame,
    audio_mode: 'native',
    characters_in_scene: [
      {
        id: 'char-1',
        name: 'Кот',
        description: 'ginger tabby cat with green eyes, sharp gaze',
      },
    ],
    visual_theme: fullVisualTheme,
    tier: 'premium',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Shape
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — output shape', () => {
  it('returns VideoPromptOutput with correct shape', () => {
    const result = buildVeo31Prompt(makeInput());
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('image_refs');
    expect(result).toHaveProperty('duration_sec', 8);
    expect(result).toHaveProperty('aspect_ratio', '9:16');
  });

  it('image_refs === [first_frame_storage]', () => {
    const result = buildVeo31Prompt(makeInput());
    expect(result.image_refs).toHaveLength(1);
    expect(result.image_refs[0]).toEqual(baseFirstFrame);
  });

  it('aspect_ratio is exactly "9:16"', () => {
    expect(buildVeo31Prompt(makeInput()).aspect_ratio).toBe('9:16');
  });

  it('duration_sec matches input.scene.duration_sec', () => {
    const input = makeInput({ scene: { ...fullScene8s, duration_sec: 5 } });
    expect(buildVeo31Prompt(input).duration_sec).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. All 5 blocks present in order
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — 5 blocks present in correct order', () => {
  it('all 5 block headers are present in the prompt', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    expect(prompt).toContain('[Cinematography]');
    expect(prompt).toContain('[Subject]');
    expect(prompt).toContain('[Action]');
    expect(prompt).toContain('[Context]');
    expect(prompt).toContain('[Style]');
  });

  it('blocks appear in order: [Cinematography] → [Subject] → [Action] → [Context] → [Style]', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const cIdx = prompt.indexOf('[Cinematography]');
    const sIdx = prompt.indexOf('[Subject]');
    const aIdx = prompt.indexOf('[Action]');
    const ctxIdx = prompt.indexOf('[Context]');
    const stIdx = prompt.indexOf('[Style]');
    expect(cIdx).toBeGreaterThan(-1);
    expect(sIdx).toBeGreaterThan(cIdx);
    expect(aIdx).toBeGreaterThan(sIdx);
    expect(ctxIdx).toBeGreaterThan(aIdx);
    expect(stIdx).toBeGreaterThan(ctxIdx);
  });
});

// ---------------------------------------------------------------------------
// 3. Block content from inputs (full scene)
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — block content from full structured scene', () => {
  it('[Cinematography] contains "Dolly In", "slow", "85mm anamorphic"', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const nextBlockIdx = prompt.indexOf('[Subject]');
    const cinBlock = prompt.slice(0, nextBlockIdx);
    expect(cinBlock).toContain('Dolly In');
    expect(cinBlock).toContain('slow');
    expect(cinBlock).toContain('85mm anamorphic');
  });

  it('[Subject] contains character name and description', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    expect(prompt).toContain('Кот');
    expect(prompt).toContain('ginger tabby cat with green eyes');
  });

  it('[Action] contains description_en', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const actionStart = prompt.indexOf('[Action]');
    const actionEnd = prompt.indexOf('[Context]');
    const actionBlock = prompt.slice(actionStart, actionEnd);
    expect(actionBlock).toContain('ginger cat slowly looks toward the horizon');
  });

  it('[Context] contains lighting.recipe, time_of_day, visual_theme.mood', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const ctxStart = prompt.indexOf('[Context]');
    const styleStart = prompt.indexOf('[Style]');
    const ctxBlock = prompt.slice(ctxStart, styleStart);
    expect(ctxBlock).toContain('golden hour rim');
    expect(ctxBlock).toContain('dusk');
    expect(ctxBlock).toContain('contemplative');
  });

  it('[Style] contains visual_theme.film_look, lens, motion', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const stIdx = prompt.indexOf('[Style]');
    const styleBlock = prompt.slice(stIdx);
    expect(styleBlock).toContain('anamorphic noir');
    expect(styleBlock).toContain('85mm anamorphic');
    expect(styleBlock).toContain('slow handheld');
  });

  it('[Style] contains "subtle grain" and "naturalistic grade" staples', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const stIdx = prompt.indexOf('[Style]');
    const styleBlock = prompt.slice(stIdx);
    expect(styleBlock).toContain('subtle grain');
    expect(styleBlock).toContain('naturalistic grade');
  });
});

// ---------------------------------------------------------------------------
// 4. 24fps pinned in [Cinematography]
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — fps', () => {
  it('[Cinematography] always contains "24fps" (fixed default)', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const cinBlock = prompt.slice(0, prompt.indexOf('[Subject]'));
    expect(cinBlock).toContain('24fps');
  });

  it('[Cinematography] contains "24fps" even when camera_movement is absent', () => {
    const input = makeInput({ scene: { ...fullScene8s, camera_movement: undefined } });
    const { prompt } = buildVeo31Prompt(input);
    const cinBlock = prompt.slice(0, prompt.indexOf('[Subject]'));
    expect(cinBlock).toContain('24fps');
  });
});

// ---------------------------------------------------------------------------
// 5. English dialogue rendered in [Action] (audio_mode=native, ASCII text)
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — English dialogue in [Action]', () => {
  it('audio_mode=native + ASCII dialogue → Dialogue: <speaker> — "<text>" in [Action]', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene8s, dialogue: { speaker: 'Кот', text: 'I see you.' } },
    });
    const { prompt } = buildVeo31Prompt(input);
    const actionStart = prompt.indexOf('[Action]');
    const contextStart = prompt.indexOf('[Context]');
    const actionBlock = prompt.slice(actionStart, contextStart);
    expect(actionBlock).toMatch(/Dialogue:\s*Кот\s*—\s*"I see you\."/);
  });
});

// ---------------------------------------------------------------------------
// 6. Russian dialogue NOT rendered
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — Russian dialogue skipped in [Action]', () => {
  it('audio_mode=native + Cyrillic dialogue text → no Dialogue: line', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene8s, dialogue: { speaker: 'Кот', text: 'Привет, мир!' } },
    });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).not.toContain('Dialogue:');
  });

  it('mixed ASCII+Cyrillic dialogue → no Dialogue: line (any Cyrillic = skip)', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene8s, dialogue: { speaker: 'Cat', text: 'Hello, кот!' } },
    });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).not.toContain('Dialogue:');
  });
});

// ---------------------------------------------------------------------------
// 6b. Lowercase Cyrillic ё edge case
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — lowercase Cyrillic ё detected', () => {
  it('lowercase "ё" (U+0451) is detected as Cyrillic and dialogue is skipped', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene8s,
        dialogue: { speaker: 'Кот', text: 'ёжик идёт' },
      },
    });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).not.toContain('ёжик идёт');
    expect(prompt).not.toMatch(/Dialogue:/);
  });
});

// ---------------------------------------------------------------------------
// 7. audio_mode=silent_tts: no dialogue line
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — audio_mode=silent_tts', () => {
  it('silent_tts + English dialogue → no Dialogue: line', () => {
    const input = makeInput({
      audio_mode: 'silent_tts',
      scene: { ...fullScene8s, dialogue: { speaker: 'Cat', text: 'I see you.' } },
    });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).not.toContain('Dialogue:');
  });
});

// ---------------------------------------------------------------------------
// 8. audio_mode=native + no dialogue
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — audio_mode=native, no dialogue', () => {
  it('native + null dialogue → no Dialogue: line', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene8s, dialogue: null },
    });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).not.toContain('Dialogue:');
  });
});

// ---------------------------------------------------------------------------
// 9. Missing camera_movement → Static framing fallback
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — missing camera_movement', () => {
  it('camera_movement absent → [Cinematography] contains "Static framing"', () => {
    const input = makeInput({ scene: { ...fullScene8s, camera_movement: undefined } });
    const { prompt } = buildVeo31Prompt(input);
    const cinBlock = prompt.slice(0, prompt.indexOf('[Subject]'));
    expect(cinBlock).toContain('Static framing');
  });
});

// ---------------------------------------------------------------------------
// 10. Empty characters → Subject fallback + @Image1
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — empty characters', () => {
  it('no characters → [Subject] falls back to "Subject as established in @Image1."', () => {
    const input = makeInput({ characters_in_scene: [] });
    const { prompt } = buildVeo31Prompt(input);
    const subjectStart = prompt.indexOf('[Subject]');
    const actionStart = prompt.indexOf('[Action]');
    const subjectBlock = prompt.slice(subjectStart, actionStart);
    expect(subjectBlock).toContain('Subject as established in @Image1');
  });

  it('undefined characters → [Subject] falls back and @Image1 is referenced', () => {
    const input = makeInput({ characters_in_scene: undefined });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).toContain('@Image1');
  });
});

// ---------------------------------------------------------------------------
// 11. Multi-character [Subject]
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — multi-character [Subject]', () => {
  it('all character descriptions appear in [Subject], @Image1 referenced', () => {
    const input = makeInput({
      characters_in_scene: [
        { id: 'c1', name: 'Кот', description: 'ginger tabby cat with green eyes, sharp gaze' },
        { id: 'c2', name: 'Пёс', description: 'black labrador, alert posture' },
      ],
    });
    const { prompt } = buildVeo31Prompt(input);
    const subjectStart = prompt.indexOf('[Subject]');
    const actionStart = prompt.indexOf('[Action]');
    const subjectBlock = prompt.slice(subjectStart, actionStart);
    expect(subjectBlock).toContain('Кот');
    expect(subjectBlock).toContain('ginger tabby cat with green eyes');
    expect(subjectBlock).toContain('Пёс');
    expect(subjectBlock).toContain('black labrador');
    expect(subjectBlock).toContain('@Image1');
  });
});

// ---------------------------------------------------------------------------
// 12. visual_theme absent → [Style] uses DEFAULT_PACING_LINE
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — visual_theme absent → [Style] fallback', () => {
  it('visual_theme absent → [Style] uses DEFAULT_PACING_LINE fallback content', () => {
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildVeo31Prompt(input);
    const stIdx = prompt.indexOf('[Style]');
    expect(stIdx).toBeGreaterThan(-1);
    // Should have some non-empty content after the header
    const styleBlock = prompt.slice(stIdx + '[Style]'.length).trim();
    // DEFAULT_PACING_LINE: 'Cinematic, naturalistic pacing; consistent grading'
    expect(styleBlock).toContain('Cinematic');
  });

  it('visual_theme absent → DEFAULT_PACING_LINE has "grading", so staples NOT appended', () => {
    // DEFAULT_PACING_LINE contains "grading" → dedupe kicks in → "subtle grain" absent
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).not.toContain('subtle grain');
  });
});

// ---------------------------------------------------------------------------
// 12b. grain/grade dedupe in [Style]
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — grain/grade dedupe in [Style]', () => {
  it('film_look containing "grain" → staples NOT appended (no duplicate "subtle grain")', () => {
    const input = makeInput({
      visual_theme: { ...fullVisualTheme, film_look: '35mm fine grain' },
    });
    const { prompt } = buildVeo31Prompt(input);
    const stIdx = prompt.indexOf('[Style]');
    const styleBlock = prompt.slice(stIdx);
    // Original film_look still present
    expect(styleBlock).toContain('35mm fine grain');
    // Staples NOT appended because "grain" already present
    expect(styleBlock).not.toContain('subtle grain');
  });

  it('film_look containing "grade" → staples NOT appended', () => {
    const input = makeInput({
      visual_theme: { ...fullVisualTheme, film_look: 'vintage colour grade' },
    });
    const { prompt } = buildVeo31Prompt(input);
    const stIdx = prompt.indexOf('[Style]');
    const styleBlock = prompt.slice(stIdx);
    expect(styleBlock).toContain('vintage colour grade');
    expect(styleBlock).not.toContain('subtle grain');
    expect(styleBlock).not.toContain('naturalistic grade');
  });

  it('film_look with no grain/grade → staples ARE appended as normal', () => {
    // fullVisualTheme.film_look = 'anamorphic noir' — no grain/grade words
    const { prompt } = buildVeo31Prompt(makeInput());
    const stIdx = prompt.indexOf('[Style]');
    const styleBlock = prompt.slice(stIdx);
    expect(styleBlock).toContain('subtle grain');
    expect(styleBlock).toContain('naturalistic grade');
  });
});

// ---------------------------------------------------------------------------
// 13. Lighting absent → [Context] naturalistic fallback
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — lighting absent → [Context] fallback', () => {
  it('no lighting in scene → [Context] contains naturalistic fallback', () => {
    const input = makeInput({
      scene: { ...fullScene8s, lighting: undefined },
      visual_theme: { ...fullVisualTheme, mood: undefined as unknown as string },
    });
    const { prompt } = buildVeo31Prompt(input);
    const ctxStart = prompt.indexOf('[Context]');
    const styleStart = prompt.indexOf('[Style]');
    const ctxBlock = prompt.slice(ctxStart, styleStart);
    expect(ctxBlock).toContain('Naturalistic ambient context');
  });

  it('lighting present but mood absent → [Context] still has lighting content', () => {
    const input = makeInput({
      visual_theme: { ...fullVisualTheme, mood: undefined as unknown as string },
    });
    const { prompt } = buildVeo31Prompt(input);
    const ctxStart = prompt.indexOf('[Context]');
    const styleStart = prompt.indexOf('[Style]');
    const ctxBlock = prompt.slice(ctxStart, styleStart);
    expect(ctxBlock).toContain('golden hour rim');
  });
});

// ---------------------------------------------------------------------------
// 14. Avoid: line decision
// Decision: EMIT the Avoid: line for Veo 3.1.
// Rationale: SKILL.md's Veo 3.1 example does NOT include Avoid:, but the
// broader prompt contract (F70) and safety principle call for it. The task
// spec says "emit it (consistency + safety)" when SKILL.md is silent.
// The Avoid: line appears after the [Style] block.
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — Avoid: line', () => {
  it('Avoid: line is present after [Style] block', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const stIdx = prompt.indexOf('[Style]');
    const avoidIdx = prompt.indexOf('Avoid:');
    expect(avoidIdx).toBeGreaterThan(-1);
    // Avoid: must come after [Style]
    expect(avoidIdx).toBeGreaterThan(stIdx);
  });

  it('Avoid: uses custom list from visual_theme.avoid when set', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    expect(prompt).toContain('camera shake');
    expect(prompt).toContain('jump cuts');
    expect(prompt).toContain('overexposure');
  });

  it('Avoid: uses DEFAULT_AVOID when visual_theme is absent', () => {
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildVeo31Prompt(input);
    expect(prompt).toContain('Avoid:');
    expect(prompt).toContain('abrupt cuts');
    expect(prompt).toContain('scene changes');
  });
});

// ---------------------------------------------------------------------------
// 15. Block ordering regression (serial index test)
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — block ordering regression', () => {
  it('5-block order + Avoid: is strictly sequential in the prompt string', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const positions = [
      ['[Cinematography]', prompt.indexOf('[Cinematography]')],
      ['[Subject]', prompt.indexOf('[Subject]')],
      ['[Action]', prompt.indexOf('[Action]')],
      ['[Context]', prompt.indexOf('[Context]')],
      ['[Style]', prompt.indexOf('[Style]')],
      ['Avoid:', prompt.indexOf('Avoid:')],
    ] as Array<[string, number]>;

    for (const [name, pos] of positions) {
      expect(pos, `"${name}" not found in prompt`).toBeGreaterThan(-1);
    }

    for (let i = 1; i < positions.length; i++) {
      const [prevName, prevPos] = positions[i - 1]!;
      const [currName, currPos] = positions[i]!;
      expect(
        currPos,
        `"${currName}" (pos ${currPos}) should come after "${prevName}" (pos ${prevPos})`,
      ).toBeGreaterThan(prevPos);
    }
  });
});

// ---------------------------------------------------------------------------
// 16. Camera movement — all 14 kinds map correctly in [Cinematography]
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — all 14 camera movement kinds', () => {
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
    it(`kind "${kind}" → [Cinematography] contains "${expectedVerb}"`, () => {
      const input = makeInput({
        scene: {
          ...fullScene8s,
          camera_movement: {
            kind: kind as VideoPromptInput['scene']['camera_movement'] extends
              | { kind: infer K }
              | undefined
              ? K
              : never,
            speed: 'medium',
          },
        },
      });
      const { prompt } = buildVeo31Prompt(input);
      const cinBlock = prompt.slice(0, prompt.indexOf('[Subject]'));
      expect(cinBlock, `kind "${kind}" should produce "${expectedVerb}"`).toContain(expectedVerb);
    });
  }
});

// ---------------------------------------------------------------------------
// 17. description_en → description fallback in [Action]
// ---------------------------------------------------------------------------

describe('buildVeo31Prompt — description_en fallback', () => {
  it('uses description_en when present', () => {
    const { prompt } = buildVeo31Prompt(makeInput());
    const actionStart = prompt.indexOf('[Action]');
    const ctxStart = prompt.indexOf('[Context]');
    const actionBlock = prompt.slice(actionStart, ctxStart);
    expect(actionBlock).toContain('ginger cat slowly looks toward the horizon');
  });

  it('falls back to description when description_en is absent', () => {
    const input = makeInput({ scene: { ...fullScene8s, description_en: undefined } });
    const { prompt } = buildVeo31Prompt(input);
    const actionStart = prompt.indexOf('[Action]');
    const ctxStart = prompt.indexOf('[Context]');
    const actionBlock = prompt.slice(actionStart, ctxStart);
    expect(actionBlock).toContain('Рыжий кот');
  });
});
