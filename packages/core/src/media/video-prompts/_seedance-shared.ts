/**
 * Shared helpers for media-prompt builders.
 *
 * Underscore prefix denotes "internal to packages/core/src/media/ (video-prompts
 * + image-prompts)" — not for import outside packages/core/src/media/.
 *
 * Historically named _seedance-shared because the Seedance Director Brief
 * builders were the first consumers. Has since broadened to cover label
 * mappings (CAMERA_VERB, SHOT_SIZE_LABEL, ANGLE_LABEL) and text-detection
 * primitives (containsCyrillic) used across multiple engines AND image-prompt
 * builders. The name is now somewhat misleading: the file holds cross-engine
 * cinematography label tables AND Seedance-family block builders. A future
 * rename/split (e.g. _cinematography-labels.ts + _seedance-blocks.ts) is
 * queued for 1.4.D/G when sufficient extraction is appropriate — do not
 * rename in the meantime without updating all import paths.
 *
 * Used by:
 *   seedance-2.ts                   — block builders, label tables, time segments
 *   seedance-lite.ts                — block builders, label tables, time segments
 *   veo-3.1.ts                      — CAMERA_VERB, DEFAULT_AVOID, DEFAULT_PACING_LINE,
 *                                     containsCyrillic
 *   kling-2.5.ts                    — CAMERA_VERB, SHOT_SIZE_LABEL, ANGLE_LABEL,
 *                                     DEFAULT_AVOID, DEFAULT_PACING_LINE
 *   ltx.ts                          — CAMERA_VERB, containsCyrillic
 *   generic.ts                      — CAMERA_VERB
 *   image-prompts/first-frame.ts    — CAMERA_VERB, SHOT_SIZE_LABEL, ANGLE_LABEL
 *
 * Seedance-specific block builders (buildSceneBlock, buildSubjectBlock,
 * buildActionBlock, buildCameraBlock, buildPacingBlock, buildAvoidLine) are
 * NOT used by veo/kling/ltx/generic/first-frame — they consume the leaf
 * primitives only and assemble their own engine-specific block structures.
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
  // Phase 1.8.0a: equivalent to normalize-script.ts's `image_prompt_text`
  // channel (description_en ?? description). Do NOT switch to
  // `narrative_paragraph` (Russian-canonical UI channel) or downstream
  // Veo/Seedance prompts flip language.
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

// ---------------------------------------------------------------------------
// Premium prompt enrichment (post-audit 2026-05-13)
//
// Engine-agnostic helpers for the "luxury animation header / per-word dialogue
// timing / micro-acting" register that pro animators use. Consumed by both
// Seedance 2.0 and Veo 3.1.
// ---------------------------------------------------------------------------

/**
 * Opening aesthetic header — a single dense line that anchors the model to
 * the production register (Pixar/Apple/Netflix-grade vs sketchy preview).
 *
 * Pulled from visual_theme + tier. Falls back to a sane premium-default when
 * visual_theme is absent so the header still steers the engine.
 */
export function buildAestheticHeader(input: VideoPromptInput): string {
  const tier = input.tier ?? 'economy';
  const vt = input.visual_theme;

  const tierLine =
    tier === 'premium'
      ? 'ultra cinematic luxury animation, Pixar + Apple + Netflix grade, 4K render, deep shadows, volumetric light, premium materials'
      : 'cinematic stylized animation, studio-grade polish, clean composition';

  const parts: string[] = ['Vertical 9:16', tierLine];

  if (vt?.mood) parts.push(`${vt.mood} mood`);
  if (vt?.film_look) parts.push(vt.film_look);
  if (vt?.lighting) parts.push(vt.lighting);
  if (vt?.lens) parts.push(vt.lens);

  return `[AESTHETIC]\n${parts.join(', ')}.`;
}

/**
 * Sub-second performance / lipsync timing block for scenes WITH dialogue.
 *
 * Why a separate block from [AUDIO]:
 *   - [AUDIO] is the engine's audio direction (muted for silent_tts mode).
 *   - [PERFORMANCE] is VISUAL — mouth shape, jaw, blinks, body energy.
 *     It applies regardless of audio_mode so the rendered video has correct
 *     lipsync even when the dialogue audio is dubbed in post (Russian → TTS).
 *
 * Returns an empty string when the scene has no dialogue — caller decides
 * whether to skip the block entirely.
 *
 * Timing scheme: ~0.6s silent lead-in, dialogue spans the middle, ~0.4s settle.
 */
export function buildPerformanceBlock(input: VideoPromptInput): string {
  const { dialogue } = input.scene;
  if (!dialogue) return '';

  const dur = input.scene.duration_sec;
  const lead = 0.6;
  const tail = 0.4;
  const speakStart = Math.min(lead, dur * 0.1);
  const speakEnd = Math.max(speakStart + 0.5, dur - tail);
  const fmt = (n: number): string => n.toFixed(1);

  const lines: string[] = [];
  lines.push(`Speaker: ${dialogue.speaker}`);
  lines.push(`Line: "${dialogue.text}"`);
  lines.push('Lipsync timing (mouth shapes, jaw, blinks — visual track only):');
  if (dur <= 1.5) {
    lines.push(`  0.0–${fmt(dur)}s: speaker delivers the line, mouth shapes clear and distinct`);
  } else {
    lines.push(`  0.0–${fmt(speakStart)}s: silent open, steady gaze, one settling blink`);
    lines.push(
      `  ${fmt(speakStart)}–${fmt(speakEnd)}s: speaker delivers the line with clear consonants, distinct phrasing, natural pause emphasis on punctuation`,
    );
    lines.push(`  ${fmt(speakEnd)}–${fmt(dur)}s: settling beat, mouth closes, gaze holds`);
  }

  // Delivery direction from authoring (voice_notes), if present.
  const voiceNotes = input.scene.audio_direction?.voice_notes;
  if (voiceNotes && voiceNotes.trim().length > 0) {
    lines.push(`Delivery: ${voiceNotes}`);
  }

  // Speech-rule guard for Cyrillic dialogue: the audio is dubbed in post, but
  // the visual lipsync must still read as a clearly-spoken line.
  if (containsCyrillic(dialogue.text)) {
    lines.push(
      'Speech rule: every word pronounced clearly — no swallowing, no mumbling, no rushed delivery. Articulation reads naturally even when the audio is added in post.',
    );
  }

  return `[PERFORMANCE]\n${lines.join('\n')}`;
}

/**
 * Micro-action block — subtle facial / body acting direction.
 *
 * Pulls from arc_role + composition.subject_focus + dialogue presence.
 * Falls back to a tasteful default so the engine renders neither
 * mannequin-stillness nor over-animated fidgeting.
 */
export function buildMicroActionBlock(input: VideoPromptInput): string {
  const { scene } = input;
  const hasDialogue = scene.dialogue !== null;
  const focus = scene.composition?.subject_focus;
  const arc = scene.arc_role;

  const lines: string[] = [];

  if (hasDialogue) {
    lines.push(
      'Minimal extraneous body movement during dialogue beats; jaw/lip activity matches the speech timing above.',
    );
    lines.push('One slow blink mid-line; subtle eyebrow micro-motion on emphasised words.');
  } else {
    lines.push('Subtle facial expression and naturalistic micro-blinks (every 2–3 seconds).');
    lines.push('Body holds intention; no idle fidgeting or random head bobbing.');
  }

  if (focus) {
    lines.push(`Gaze and attention anchored to: ${focus}.`);
  }

  if (arc === 'hook') {
    lines.push('Energy: curious, slightly heightened — invites the viewer in.');
  } else if (arc === 'climax') {
    lines.push('Energy: peak intensity, contained — read in the eyes, not in big gestures.');
  } else if (arc === 'payoff' || arc === 'cta') {
    lines.push('Energy: settled, exhalation — earned calm or quiet satisfaction.');
  } else if (arc === 'rising') {
    lines.push('Energy: building, deliberate — pressure accumulates frame by frame.');
  }

  return `[MICRO ACTION]\n${lines.join('\n')}`;
}
