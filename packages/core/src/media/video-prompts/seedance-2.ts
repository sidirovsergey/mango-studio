import type { CameraAngle, CameraMovementKind, ShotSize } from '../cinematography-schemas';
import type { VideoPromptInput, VideoPromptOutput } from './types';

// ---------------------------------------------------------------------------
// Camera movement verb mapping (snake_case → Title Case)
// ---------------------------------------------------------------------------

const CAMERA_VERB: Record<CameraMovementKind, string> = {
  static: 'Static',
  dolly_in: 'Dolly In',
  dolly_out: 'Dolly Out',
  pan_left: 'Pan Left',
  pan_right: 'Pan Right',
  tilt_up: 'Tilt Up',
  tilt_down: 'Tilt Down',
  tracking: 'Tracking',
  orbit: 'Orbit',
  crane_up: 'Crane Up',
  crane_down: 'Crane Down',
  whip_pan: 'Whip Pan',
  handheld: 'Handheld',
  pov_walk: 'POV Walk',
};

// ---------------------------------------------------------------------------
// Shot size / angle mapping (snake_case → Title Case)
// ---------------------------------------------------------------------------

const SHOT_SIZE_LABEL: Record<ShotSize, string> = {
  extreme_close_up: 'Extreme Close Up',
  close_up: 'Close Up',
  medium_close_up: 'Medium Close Up',
  medium: 'Medium',
  full: 'Full',
  wide: 'Wide',
  extreme_wide: 'Extreme Wide',
};

const ANGLE_LABEL: Record<CameraAngle, string> = {
  eye_level: 'Eye Level',
  low_angle: 'Low Angle',
  high_angle: 'High Angle',
  birds_eye: "Bird's Eye",
  dutch: 'Dutch',
  over_shoulder: 'Over Shoulder',
  pov: 'POV',
};

// ---------------------------------------------------------------------------
// Default negative list (F70)
// ---------------------------------------------------------------------------

const DEFAULT_AVOID = [
  'abrupt cuts',
  'scene changes',
  'lens flares masking faces',
  'multiple disconnected vignettes',
  'text overlays',
];

// ---------------------------------------------------------------------------
// Time-segment helpers
// ---------------------------------------------------------------------------

/**
 * Returns an array of [startSec, endSec] tuples for the [ACTION] block.
 *
 * Rules per the concrete grammar spec:
 * - ≤5s   → single beat, no time-segment prefixes
 * - 6–9s  → 2 segments (split at ~40% of duration)
 * - 10s   → 3 segments: 0–3s, 3–7s, 7–10s (matches spec example exactly)
 * - 11–12s → 3 segments: 0–4s, 4–8s, 8–end
 *
 * Note: the plan's prose says "6–10s: 2 segments" but the concrete grammar
 * example for 10s shows three segments. The concrete example takes precedence.
 */
function timeSegments(durationSec: number): Array<[number, number]> {
  if (durationSec <= 5) {
    return []; // single beat, no time prefixes
  }
  if (durationSec === 10) {
    // Spec example: 0–3s, 3–7s, 7–10s
    return [
      [0, 3],
      [3, 7],
      [7, 10],
    ];
  }
  if (durationSec <= 9) {
    // 2-segment split: roughly 40% / 60% of duration
    const mid = Math.round(durationSec * 0.4);
    return [
      [0, mid],
      [mid, durationSec],
    ];
  }
  // 11–12s: 3 segments (0–4s, 4–8s, 8–end)
  return [
    [0, 4],
    [4, 8],
    [8, durationSec],
  ];
}

function formatSegment(start: number, end: number): string {
  return `${start}–${end}s:`;
}

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

function buildSceneBlock(input: VideoPromptInput): string {
  const desc = input.scene.description_en ?? input.scene.description;
  const lightingLine = input.scene.lighting?.recipe
    ? `; lighting: ${input.scene.lighting.recipe}`
    : '';
  return `[SCENE]\n${desc}${lightingLine}`;
}

function buildSubjectBlock(input: VideoPromptInput): string {
  const chars = input.characters_in_scene ?? [];
  if (chars.length === 0) {
    return '[SUBJECT]\nSubject: as established in @Image1';
  }
  if (chars.length === 1) {
    const c = chars[0]!;
    return `[SUBJECT]\nSubject: ${c.name} — ${c.description}; reference: @Image1`;
  }
  // Multiple characters
  const charList = chars.map((c) => `${c.name} — ${c.description}`).join(', ');
  return `[SUBJECT]\n${charList}; together in frame; reference: @Image1`;
}

function buildActionBlock(input: VideoPromptInput): string {
  const desc = input.scene.description_en ?? input.scene.description;
  const segments = timeSegments(input.scene.duration_sec);

  if (segments.length === 0) {
    // Single beat: just emit description
    return `[ACTION]\n${desc}`;
  }

  // Distribute description across segments.
  // Strategy: split description into sentences; assign one per segment.
  // If fewer sentences than segments, repeat the last sentence.
  // This is the simplest viable approach per the plan — real beat authoring
  // lives on the LLM side (Phase 1.4.B).
  const sentences = desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const segmentLines = segments.map(([start, end], i) => {
    const text = sentences[i] ?? sentences[sentences.length - 1] ?? desc;
    return `${formatSegment(start, end)} ${text}`;
  });

  return `[ACTION]\n${segmentLines.join('\n')}`;
}

function buildCameraBlock(input: VideoPromptInput): string {
  const { camera_movement, composition } = input.scene;

  const shotParts: string[] = [];
  if (composition?.shot_size) {
    shotParts.push(SHOT_SIZE_LABEL[composition.shot_size]);
  }
  if (composition?.angle) {
    shotParts.push(ANGLE_LABEL[composition.angle]);
  }
  const shotStr = shotParts.length > 0 ? `; shot: ${shotParts.join(', ')}` : '';

  if (!camera_movement) {
    return `[CAMERA]\nStatic${shotStr}`;
  }

  const verb = CAMERA_VERB[camera_movement.kind];
  const speedStr = camera_movement.speed ? ` (${camera_movement.speed})` : '';
  const lensStr = camera_movement.lens_character ? ` — ${camera_movement.lens_character}` : '';

  return `[CAMERA]\n${verb}${speedStr}${lensStr}${shotStr}`;
}

/**
 * Build [AUDIO] block.
 *
 * F66 fix: for silent_tts audio mode on a native-audio engine, emit a
 * quiet-bed directive so Seedance doesn't generate random ambient that
 * fights the TTS layer we add in post.
 *
 * For 'auto' mode: treat as 'native' — upstream should have resolved this
 * before reaching the builder, but we defend here anyway.
 */
function buildAudioBlock(input: VideoPromptInput): string {
  const { audio_mode, scene } = input;

  if (audio_mode === 'silent_tts') {
    return '[AUDIO]\nNo dialogue, no music; ambient room tone only — voice dubbed in post';
  }

  // native or auto → emit full audio direction
  const { audio_direction, dialogue } = scene;
  const parts: string[] = [];

  if (audio_direction?.music) {
    parts.push(`Music: ${audio_direction.music}.`);
  }
  if (audio_direction?.ambient) {
    parts.push(`Ambient: ${audio_direction.ambient}.`);
  }
  if (audio_direction?.sfx && audio_direction.sfx.length > 0) {
    parts.push(`SFX: ${audio_direction.sfx.join(', ')}.`);
  }

  // Dialogue only when audio_mode is 'native' (or 'auto' treated as native)
  // and scene.dialogue is non-null. (F73 fix: audio_mode is the source of truth)
  if (dialogue) {
    parts.push(`Dialogue: ${dialogue.speaker} — "${dialogue.text}"`);
  }

  const body = parts.length > 0 ? parts.join(' ') : 'Natural ambient audio.';
  return `[AUDIO]\n${body}`;
}

function buildPacingBlock(input: VideoPromptInput): string {
  const filmLook =
    input.visual_theme?.film_look ?? 'Cinematic, naturalistic pacing; consistent grading';
  return `[Pacing/Style]\n${filmLook}`;
}

function buildAvoidLine(input: VideoPromptInput): string {
  const avoidList =
    input.visual_theme?.avoid && input.visual_theme.avoid.length > 0
      ? input.visual_theme.avoid
      : DEFAULT_AVOID;
  return `Avoid: ${avoidList.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Builds a Seedance 2.0 Director Brief for image-to-video generation.
 *
 * Implements the 6-component hierarchy from seedance-cinematography.md:
 * [SCENE] → [SUBJECT] → [ACTION] → [CAMERA] → [AUDIO] → [Pacing/Style] → Avoid:
 *
 * Addresses audit findings:
 * - F65: Engine-specific prompt (not the generic paragraph)
 * - F66: Audio direction for silent_tts scenes (quiet-bed directive)
 * - F67: Time-segmented prompts for >5s scenes
 * - F68: Real camera verbs from camera_movement.kind enum
 * - F70: Negative prompt (Avoid: line)
 * - F71: [Pacing/Style] color-grade line from visual_theme.film_look
 */
export function buildSeedance2Prompt(input: VideoPromptInput): VideoPromptOutput {
  const blocks = [
    buildSceneBlock(input),
    buildSubjectBlock(input),
    buildActionBlock(input),
    buildCameraBlock(input),
    buildAudioBlock(input),
    buildPacingBlock(input),
    buildAvoidLine(input),
  ];

  const prompt = blocks.join('\n\n');

  return {
    prompt,
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
