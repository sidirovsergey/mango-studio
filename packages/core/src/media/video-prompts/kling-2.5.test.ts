import { describe, expect, it } from 'vitest';
import { DEFAULT_AVOID, DEFAULT_PACING_LINE } from './_seedance-shared';
import { buildKling25Prompt } from './kling-2.5';
import type { VideoPromptInput } from './types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseFirstFrame = {
  kind: 'fal_passthrough' as const,
  url: 'https://fal.cdn/first-frame.png',
};

/** 10s scene with all optional fields set — 3 sentences in description_en */
const fullScene10s: VideoPromptInput['scene'] = {
  scene_id: 's1',
  description: 'Рыжий кот смотрит в горизонт. Ветер треплет шерсть. Он разворачивается.',
  description_en: 'A ginger cat looks toward the horizon. Wind ruffles the fur. It turns around.',
  duration_sec: 10,
  dialogue: null,
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
    model: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    scene: fullScene10s,
    first_frame_storage: baseFirstFrame,
    audio_mode: 'silent_tts',
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

describe('buildKling25Prompt — output shape', () => {
  it('returns VideoPromptOutput with correct shape', () => {
    const result = buildKling25Prompt(makeInput());
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('image_refs');
    expect(result).toHaveProperty('duration_sec', 10);
    expect(result).toHaveProperty('aspect_ratio', '9:16');
  });

  it('image_refs === [first_frame_storage]', () => {
    const result = buildKling25Prompt(makeInput());
    expect(result.image_refs).toHaveLength(1);
    expect(result.image_refs[0]).toEqual(baseFirstFrame);
  });

  it('aspect_ratio is exactly "9:16"', () => {
    expect(buildKling25Prompt(makeInput()).aspect_ratio).toBe('9:16');
  });

  it('duration_sec matches input.scene.duration_sec', () => {
    const input = makeInput({ scene: { ...fullScene10s, duration_sec: 5 } });
    expect(buildKling25Prompt(input).duration_sec).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. Beat timestamp generation — count and format
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — 5s → 1 beat with timestamp', () => {
  it('5s scene → single beat [00:00–00:05]', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 5, description_en: 'Hero stands still.' },
    });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('[00:00–00:05]');
  });

  it('5s scene → exactly 1 beat timestamp line (no second beat)', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 5, description_en: 'Hero stands still.' },
    });
    const { prompt } = buildKling25Prompt(input);
    const beatLines = prompt.match(/\[00:\d{2}[––]\d{2}:\d{2}\]/g) ?? [];
    expect(beatLines).toHaveLength(1);
  });
});

describe('buildKling25Prompt — 7s → 2 beats', () => {
  it('7s scene → 2 beat timestamps [00:00–00:03] + [00:03–00:07]', () => {
    // mid = Math.round(7 * 0.4) = Math.round(2.8) = 3
    const input = makeInput({ scene: { ...fullScene10s, duration_sec: 7 } });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('[00:00–00:03]');
    expect(prompt).toContain('[00:03–00:07]');
  });

  it('7s scene → exactly 2 beat lines', () => {
    const input = makeInput({ scene: { ...fullScene10s, duration_sec: 7 } });
    const { prompt } = buildKling25Prompt(input);
    const beatLines = prompt.match(/\[00:\d{2}[––]\d{2}:\d{2}\]/g) ?? [];
    expect(beatLines).toHaveLength(2);
  });

  it('6s scene → 2 beats: [00:00–00:02] + [00:02–00:06]', () => {
    // mid = Math.round(6 * 0.4) = Math.round(2.4) = 2
    const input = makeInput({ scene: { ...fullScene10s, duration_sec: 6 } });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('[00:00–00:02]');
    expect(prompt).toContain('[00:02–00:06]');
  });
});

describe('buildKling25Prompt — 10s → 3 beats', () => {
  it('10s scene → 3 beats: [00:00–00:03], [00:03–00:07], [00:07–00:10]', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).toContain('[00:00–00:03]');
    expect(prompt).toContain('[00:03–00:07]');
    expect(prompt).toContain('[00:07–00:10]');
  });

  it('10s scene → exactly 3 beat lines', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    const beatLines = prompt.match(/\[00:\d{2}[––]\d{2}:\d{2}\]/g) ?? [];
    expect(beatLines).toHaveLength(3);
  });
});

describe('buildKling25Prompt — 12s → 3 beats', () => {
  it('12s scene → 3 beats: [00:00–00:04], [00:04–00:08], [00:08–00:12]', () => {
    const input = makeInput({ scene: { ...fullScene10s, duration_sec: 12 } });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('[00:00–00:04]');
    expect(prompt).toContain('[00:04–00:08]');
    expect(prompt).toContain('[00:08–00:12]');
  });

  it('11s scene → 3 beats: [00:00–00:04], [00:04–00:08], [00:08–00:11]', () => {
    const input = makeInput({ scene: { ...fullScene10s, duration_sec: 11 } });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('[00:00–00:04]');
    expect(prompt).toContain('[00:04–00:08]');
    expect(prompt).toContain('[00:08–00:11]');
  });
});

// ---------------------------------------------------------------------------
// 3. Timestamp format: zero-padded and en-dash
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — timestamp format', () => {
  it('timestamps are zero-padded MM:SS (e.g. [00:05] not [0:5])', () => {
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 5, description_en: 'Hero stands still.' },
    });
    const { prompt } = buildKling25Prompt(input);
    // Should NOT have single-digit minute or second
    expect(prompt).not.toMatch(/\[0:\d+\]/);
    expect(prompt).not.toMatch(/\[\d+:(?!\d{2})[^\]]/);
    // Should have zero-padded format
    expect(prompt).toContain('[00:00');
    expect(prompt).toContain('00:05]');
  });

  it('uses en-dash U+2013 in beat timestamps (not hyphen U+002D)', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    // The beat timestamp pattern uses U+2013 (–)
    expect(prompt).toContain('–');
    // Not a hyphen between the time segments
    const hyphenBeat = prompt.match(/\[00:\d{2}-\d{2}:\d{2}\]/);
    expect(hyphenBeat).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Camera verb in beat line
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — camera verb in beat line', () => {
  it('tracking + fast + lens → beat line contains "Tracking (fast)" and lens', () => {
    const input = makeInput({
      scene: {
        ...fullScene10s,
        camera_movement: { kind: 'tracking', speed: 'fast', lens_character: '35mm wide' },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    // Camera context appears in at least one beat line
    expect(prompt).toContain('Tracking (fast)');
    expect(prompt).toContain('35mm wide');
  });

  it('dolly_in + slow + lens → beat line contains "Dolly In (slow)" and lens', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).toContain('Dolly In (slow)');
    expect(prompt).toContain('85mm anamorphic');
  });

  it('camera_movement absent → beat line contains "Static"', () => {
    const input = makeInput({ scene: { ...fullScene10s, camera_movement: undefined } });
    const { prompt } = buildKling25Prompt(input);
    // Static appears in beat context (not the Avoid line or other blocks)
    const beatSection = prompt.split('\n\n')[0] ?? '';
    expect(beatSection).toContain('Static');
  });
});

// ---------------------------------------------------------------------------
// 5. Subject cue — character name in beats
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — subject cue in beats', () => {
  it('first character name appears in beat section', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    const beatSection = prompt.split('\n\n')[0] ?? '';
    expect(beatSection).toContain('Кот');
  });

  it('empty characters_in_scene → beat lines produced, no crash', () => {
    const input = makeInput({ characters_in_scene: [] });
    expect(() => buildKling25Prompt(input)).not.toThrow();
    const { prompt } = buildKling25Prompt(input);
    // Should still have beat timestamps
    expect(prompt).toContain('[00:00');
  });

  it('undefined characters_in_scene → beat lines produced, no crash', () => {
    const input = makeInput({ characters_in_scene: undefined });
    expect(() => buildKling25Prompt(input)).not.toThrow();
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('[00:00');
  });

  it('empty characters_in_scene → beat lines have no trailing " — " without subject', () => {
    // The subject-cue dash-segment should be omitted entirely (no dangling dash)
    const input = makeInput({ characters_in_scene: [] });
    const { prompt } = buildKling25Prompt(input);
    const beatSection = prompt.split('\n\n')[0] ?? '';
    const lines = beatSection.split('\n').filter((l) => l.startsWith('['));
    for (const line of lines) {
      // Last segment should not be a trailing ' — ' with nothing after
      expect(line).not.toMatch(/ — \s*$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Sentence distribution across beats
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — sentence distribution', () => {
  it('3-sentence description over 10s → each beat gets its own sentence', () => {
    // fullScene10s.description_en has 3 sentences:
    //   "A ginger cat looks toward the horizon."
    //   "Wind ruffles the fur."
    //   "It turns around."
    const { prompt } = buildKling25Prompt(makeInput());
    const beatSection = prompt.split('\n\n')[0] ?? '';
    expect(beatSection).toContain('A ginger cat looks toward the horizon');
    expect(beatSection).toContain('Wind ruffles the fur');
    expect(beatSection).toContain('It turns around');
  });

  it('1-sentence description over 10s → first beat has sentence, others have continuation fallback', () => {
    const input = makeInput({
      scene: {
        ...fullScene10s,
        description_en: 'Hero pauses at the threshold.',
        duration_sec: 10,
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const beatSection = prompt.split('\n\n')[0] ?? '';
    const lines = beatSection.split('\n').filter((l) => l.startsWith('['));
    // beat 0 has the sentence
    expect(lines[0]).toContain('Hero pauses at the threshold');
    // beats 1+ have continuation fallback
    expect(lines[1]).toContain('continued action from previous beat');
    expect(lines[2]).toContain('continued action from previous beat');
  });

  it('5s single-beat scene → whole description in the one beat line', () => {
    const desc = 'Hero stands very still in the doorway.';
    const input = makeInput({
      scene: { ...fullScene10s, duration_sec: 5, description_en: desc },
    });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('Hero stands very still in the doorway');
  });
});

// ---------------------------------------------------------------------------
// 7. Audio line
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — Audio line silent_tts', () => {
  it('silent_tts → exact audio line with em-dash U+2014', () => {
    const input = makeInput({ audio_mode: 'silent_tts' });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain(
      'Audio: No native dialogue or music — voice dubbed in post; ambient room tone only',
    );
  });

  it('silent_tts → no ambient/music/sfx cue details in audio line', () => {
    const input = makeInput({ audio_mode: 'silent_tts' });
    const { prompt } = buildKling25Prompt(input);
    // Check the Audio line itself doesn't leak audio_direction content
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    expect(audioLine).not.toContain('sparse strings');
    expect(audioLine).not.toContain('distant city');
    expect(audioLine).not.toContain('fabric rustle');
  });
});

describe('buildKling25Prompt — Audio line with full audio_direction (native mode)', () => {
  it('audio_mode=native + full audio_direction → ambient at [00:00], music at [00:02], sfx at 70%', () => {
    const input = makeInput({ audio_mode: 'native' });
    const { prompt } = buildKling25Prompt(input);
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    // ambient at t=0
    expect(audioLine).toContain('[00:00] distant city hum');
    // music at 00:02 (duration >= 8s → fixed position)
    expect(audioLine).toContain('[00:02] sparse strings build');
    // sfx at ~70% of 10s = 7s
    expect(audioLine).toContain('[00:07] fabric rustle');
  });

  it('audio_direction absent → "Audio: ambient naturalistic tone"', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: { ...fullScene10s, audio_direction: undefined },
    });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain('Audio: ambient naturalistic tone');
  });

  it('audio_mode=native + only music present → only music cue in audio line', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        audio_direction: { music: 'upbeat jazz' },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    expect(audioLine).toContain('upbeat jazz');
    expect(audioLine).not.toContain('[00:00]');
    // Only 1 cue
    const cueCount = (audioLine.match(/\[00:\d{2}\]/g) ?? []).length;
    expect(cueCount).toBe(1);
  });

  it('audio_mode=native short scene (5s) + music → music cue at ~25% position', () => {
    // 25% of 5 = 1.25, round → 1s → [00:01]
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        duration_sec: 5,
        audio_direction: { music: 'soft piano' },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    expect(audioLine).toContain('[00:01] soft piano');
  });
});

// ---------------------------------------------------------------------------
// 8. Style line
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — Style line', () => {
  it('full visual_theme → Style: film_look, lens, motion', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).toContain('Style: anamorphic noir, 85mm anamorphic, slow handheld');
  });

  it('visual_theme with no film_look → Style: DEFAULT_PACING_LINE', () => {
    const input = makeInput({
      visual_theme: { ...fullVisualTheme, film_look: undefined },
    });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain(`Style: ${DEFAULT_PACING_LINE}`);
  });

  it('visual_theme absent → Style: DEFAULT_PACING_LINE', () => {
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).toContain(`Style: ${DEFAULT_PACING_LINE}`);
  });
});

// ---------------------------------------------------------------------------
// 9. Avoid line
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — Avoid line', () => {
  it('visual_theme.avoid override → custom list used', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).toContain('camera shake');
    expect(prompt).toContain('jump cuts');
    expect(prompt).toContain('overexposure');
  });

  it('visual_theme absent → DEFAULT_AVOID used', () => {
    const input = makeInput({ visual_theme: undefined });
    const { prompt } = buildKling25Prompt(input);
    const avoidLine = prompt.split('\n').find((l) => l.startsWith('Avoid:')) ?? '';
    for (const item of DEFAULT_AVOID) {
      expect(avoidLine).toContain(item);
    }
  });

  it('visual_theme present but avoid empty → DEFAULT_AVOID used', () => {
    const input = makeInput({ visual_theme: { ...fullVisualTheme, avoid: [] } });
    const { prompt } = buildKling25Prompt(input);
    const avoidLine = prompt.split('\n').find((l) => l.startsWith('Avoid:')) ?? '';
    for (const item of DEFAULT_AVOID) {
      expect(avoidLine).toContain(item);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Framing line
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — Framing line', () => {
  it('composition with shot_size + angle → "Framing: Close Up, Eye Level" before first beat', () => {
    const input = makeInput({
      scene: {
        ...fullScene10s,
        composition: { shot_size: 'close_up', angle: 'eye_level' },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const framingIdx = prompt.indexOf('Framing:');
    const firstBeatIdx = prompt.indexOf('[00:00');
    expect(framingIdx).toBeGreaterThan(-1);
    expect(framingIdx).toBeLessThan(firstBeatIdx);
    expect(prompt).toContain('Framing: Close Up, Eye Level');
  });

  it('composition absent → no Framing: line', () => {
    const input = makeInput({ scene: { ...fullScene10s, composition: undefined } });
    const { prompt } = buildKling25Prompt(input);
    expect(prompt).not.toContain('Framing:');
  });
});

// ---------------------------------------------------------------------------
// 11. Reference line
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — Reference line', () => {
  it('"Reference: @Image1" is the last line', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    const lines = prompt.split('\n').filter((l) => l.trim().length > 0);
    expect(lines[lines.length - 1]).toBe('Reference: @Image1');
  });

  it('"Reference: @Image1" is present', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).toContain('Reference: @Image1');
  });
});

// ---------------------------------------------------------------------------
// 12. Block order regression
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — block order regression', () => {
  it('order: Framing → Beats → blank → Audio → Style → Avoid → Reference', () => {
    const { prompt } = buildKling25Prompt(makeInput());

    const framingIdx = prompt.indexOf('Framing:');
    const firstBeatIdx = prompt.indexOf('[00:00');
    const audioIdx = prompt.indexOf('Audio:');
    const styleIdx = prompt.indexOf('Style:');
    const avoidIdx = prompt.indexOf('Avoid:');
    const refIdx = prompt.indexOf('Reference: @Image1');

    // All present
    expect(framingIdx).toBeGreaterThan(-1);
    expect(firstBeatIdx).toBeGreaterThan(-1);
    expect(audioIdx).toBeGreaterThan(-1);
    expect(styleIdx).toBeGreaterThan(-1);
    expect(avoidIdx).toBeGreaterThan(-1);
    expect(refIdx).toBeGreaterThan(-1);

    // Ordering
    expect(framingIdx).toBeLessThan(firstBeatIdx);
    expect(firstBeatIdx).toBeLessThan(audioIdx);
    expect(audioIdx).toBeLessThan(styleIdx);
    expect(styleIdx).toBeLessThan(avoidIdx);
    expect(avoidIdx).toBeLessThan(refIdx);
  });

  it('blank line between beat section and Audio line', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    // The beats block and Audio/Style/Avoid/Ref block are separated by \n\n
    const parts = prompt.split('\n\n');
    expect(parts.length).toBeGreaterThanOrEqual(2);
    // Second group should start with Audio:
    const secondGroup = parts[1] ?? '';
    expect(secondGroup.trimStart()).toMatch(/^Audio:/);
  });
});

// ---------------------------------------------------------------------------
// 13. No Seedance block headers bleed
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — no Seedance block headers', () => {
  it('no [SCENE] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[SCENE]');
  });

  it('no [SUBJECT] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[SUBJECT]');
  });

  it('no [ACTION] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[ACTION]');
  });

  it('no [CAMERA] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[CAMERA]');
  });

  it('no [AUDIO] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[AUDIO]');
  });

  it('no [Pacing/Style] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[Pacing/Style]');
  });
});

// ---------------------------------------------------------------------------
// 14. No Veo block headers bleed
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — no Veo block headers', () => {
  it('no [Cinematography] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[Cinematography]');
  });

  it('no [Subject] header (capital S) in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[Subject]');
  });

  it('no [Action] header (capital A) in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[Action]');
  });

  it('no [Context] header in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[Context]');
  });

  it('no [Style] header (Veo bracket form) in prompt', () => {
    const { prompt } = buildKling25Prompt(makeInput());
    expect(prompt).not.toContain('[Style]');
  });
});

// ---------------------------------------------------------------------------
// 15. All 14 camera verbs — parametric test
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — all 14 camera movement kinds', () => {
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
    it(`kind "${kind}" → beat line contains "${expectedVerb}"`, () => {
      const input = makeInput({
        scene: {
          ...fullScene10s,
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
      const { prompt } = buildKling25Prompt(input);
      const beatSection = prompt.split('\n\n')[0] ?? '';
      expect(beatSection, `kind "${kind}" should produce "${expectedVerb}"`).toContain(
        expectedVerb,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 16. Audio cue positioning — deterministic rule verification
// ---------------------------------------------------------------------------

describe('buildKling25Prompt — audio cue positioning rules', () => {
  // Rule: music cue at fixed [00:02] when duration >= 8s; at ~25% when < 8s
  it('8s scene + music → music at [00:02]', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        duration_sec: 8,
        audio_direction: { music: 'deep drone' },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    expect(audioLine).toContain('[00:02] deep drone');
  });

  it('7s scene + music → music at ~25% = Math.round(7*0.25)=2s → [00:02]', () => {
    // Math.round(7 * 0.25) = Math.round(1.75) = 2
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        duration_sec: 7,
        audio_direction: { music: 'light strings' },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    expect(audioLine).toContain('[00:02] light strings');
  });

  it('sfx at ~70% of duration: 10s → [00:07]', () => {
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        duration_sec: 10,
        audio_direction: { sfx: ['thunderclap'] },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    expect(audioLine).toContain('[00:07] thunderclap');
  });

  it('sfx at ~70% of duration: 5s → [00:04]', () => {
    // Math.round(5 * 0.7) = Math.round(3.5) = 4 → [00:04]
    const input = makeInput({
      audio_mode: 'native',
      scene: {
        ...fullScene10s,
        duration_sec: 5,
        audio_direction: { sfx: ['snap'] },
      },
    });
    const { prompt } = buildKling25Prompt(input);
    const audioLine = prompt.split('\n').find((l) => l.startsWith('Audio:')) ?? '';
    expect(audioLine).toContain('[00:04] snap');
  });
});
