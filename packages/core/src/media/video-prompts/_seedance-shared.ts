/**
 * Shared helpers for video-prompt builders.
 *
 * Underscore prefix denotes "internal to the video-prompts module" —
 * not for import outside packages/core/src/media/video-prompts/.
 *
 * Historically named _seedance-shared because the Seedance Director Brief
 * builders were the first consumers. Has since broadened to cover label
 * mappings (CAMERA_VERB, SHOT_SIZE_LABEL, ANGLE_LABEL) and text-detection
 * primitives (containsCyrillic) used across multiple engines.
 *
 * Used by:
 *   seedance-2.ts          — block builders, label tables, time segments
 *   seedance-lite.ts       — block builders, label tables, time segments
 *   veo-3.1.ts             — CAMERA_VERB, DEFAULT_AVOID, DEFAULT_PACING_LINE,
 *                            containsCyrillic
 *   kling-2.5.ts           — CAMERA_VERB, SHOT_SIZE_LABEL, ANGLE_LABEL,
 *                            DEFAULT_AVOID, DEFAULT_PACING_LINE
 *   ltx.ts                 — CAMERA_VERB, containsCyrillic
 *   generic.ts             — CAMERA_VERB
 *
 * Seedance-specific block builders (buildSceneBlock, buildSubjectBlock,
 * buildActionBlock, buildCameraBlock, buildPacingBlock, buildAvoidLine) are
 * NOT used by veo/kling/ltx/generic — they consume the leaf primitives only
 * and assemble their own engine-specific block structures.
 */

import type { CameraAngle, CameraMovementKind, ShotSize } from '../cinematography-schemas';
import type { VideoPromptInput } from './types';

// ---------------------------------------------------------------------------
// Text detection (shared across engine builders)
// ---------------------------------------------------------------------------

/**
 * True when text contains any Cyrillic codepoint (basic block U+0400–U+04FF).
 * Used by Veo and LTX to gate dialogue rendering — engines render English
 * audio reliably; Cyrillic audio is unproven. Engines that don't render
 * dialogue at all (Seedance Lite, Kling, Generic) ignore this.
 */
export function containsCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text);
}

// ---------------------------------------------------------------------------
// Camera movement verb mapping (snake_case → Title Case)
// ---------------------------------------------------------------------------

export const CAMERA_VERB: Record<CameraMovementKind, string> = {
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

export const SHOT_SIZE_LABEL: Record<ShotSize, string> = {
  extreme_close_up: 'Extreme Close Up',
  close_up: 'Close Up',
  medium_close_up: 'Medium Close Up',
  medium: 'Medium',
  full: 'Full',
  wide: 'Wide',
  extreme_wide: 'Extreme Wide',
};

export const ANGLE_LABEL: Record<CameraAngle, string> = {
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

export const DEFAULT_AVOID = [
  'abrupt cuts',
  'scene changes',
  'lens flares masking faces',
  'multiple disconnected vignettes',
  'text overlays',
];

// ---------------------------------------------------------------------------
// Default pacing fallback (F71)
// ---------------------------------------------------------------------------

export const DEFAULT_PACING_LINE = 'Cinematic, naturalistic pacing; consistent grading';

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
export function timeSegments(durationSec: number): Array<[number, number]> {
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
  if (durationSec <= 12) {
    return [
      [0, 4],
      [4, 8],
      [8, durationSec],
    ];
  }
  // Scene durations are capped at 12s by SceneSchema. This branch is a defense
  // for malformed input — segments are clamped to a 12s timeline, not the raw
  // duration.
  return [
    [0, 4],
    [4, 8],
    [8, 12],
  ];
}

function formatSegment(start: number, end: number): string {
  return `${start}–${end}s:`;
}

// ---------------------------------------------------------------------------
// Block builders (shared between Seedance 2.0 and Seedance Lite)
// ---------------------------------------------------------------------------

export function buildSceneBlock(input: VideoPromptInput): string {
  const { lighting } = input.scene;

  if (!lighting) {
    return '[SCENE]\nEnvironment: cinematic naturalistic setting';
  }

  const lines: string[] = [];
  if (lighting.recipe) {
    lines.push(`Lighting: ${lighting.recipe}`);
  }
  if (lighting.time_of_day) {
    lines.push(`Time: ${lighting.time_of_day}`);
  }
  if (lighting.key_direction) {
    lines.push(`Key: ${lighting.key_direction}`);
  }

  // If the lighting object exists but all fields are absent, fall back gracefully.
  if (lines.length === 0) {
    return '[SCENE]\nEnvironment: cinematic naturalistic setting';
  }

  return `[SCENE]\n${lines.join('\n')}`;
}

export function buildSubjectBlock(input: VideoPromptInput): string {
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
  return `[SUBJECT]\nSubject: ${charList}; together in frame; reference: @Image1`;
}

export function buildActionBlock(input: VideoPromptInput): string {
  const desc = input.scene.description_en ?? input.scene.description;
  const segments = timeSegments(input.scene.duration_sec);

  if (segments.length === 0) {
    // Single beat: just emit description
    return `[ACTION]\n${desc}`;
  }

  // Distribute description across segments.
  // Strategy: split description into sentences; assign one per segment.
  // If fewer sentences than segments, trailing segments emit a generic
  // continuation line rather than duplicating the last sentence.
  // Real beat authoring lives on the LLM side (Phase 1.4.B).
  const sentences = desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const segmentLines = segments.map(([start, end], i) => {
    const text = sentences[i] ?? 'continued action from previous beat';
    return `${formatSegment(start, end)} ${text}`;
  });

  return `[ACTION]\n${segmentLines.join('\n')}`;
}

export function buildCameraBlock(input: VideoPromptInput): string {
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

export function buildPacingBlock(input: VideoPromptInput): string {
  const filmLook = input.visual_theme?.film_look ?? DEFAULT_PACING_LINE;
  return `[Pacing/Style]\n${filmLook}`;
}

export function buildAvoidLine(input: VideoPromptInput): string {
  const avoidList =
    input.visual_theme?.avoid && input.visual_theme.avoid.length > 0
      ? input.visual_theme.avoid
      : DEFAULT_AVOID;
  return `Avoid: ${avoidList.join(', ')}`;
}
