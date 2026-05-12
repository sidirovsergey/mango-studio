/**
 * Veo 3.1 block grammar prompt builder.
 *
 * Implements the 5-block grammar from prompt-engineering-baseline/SKILL.md
 * §"Veo 3.1 — structured block grammar":
 *   [Cinematography] → [Subject] → [Action] → [Context] → [Style] → Avoid:
 *
 * Addresses audit finding F65: per-engine prompt (not a generic paragraph).
 *
 * Design decisions documented here:
 * - Path A: imports label tables from _seedance-shared.ts (CAMERA_VERB,
 *   DEFAULT_AVOID, DEFAULT_PACING_LINE — shot-size/angle labels are NOT
 *   used by Veo grammar).
 * - Avoid: line IS emitted. SKILL.md's Veo example omits it, but the broader
 *   safety principle and audit (F70) call for it. Task spec: "emit it" when
 *   SKILL.md is silent on the matter.
 * - fps: fixed to "24fps cinematic" as a hard-coded default. Veo 3.1 processes
 *   at the fps it infers, but the phrase steers it toward cinematic cadence.
 *   Will be schema-driven in a future phase.
 * - Russian dialogue detection: Cyrillic regex /[Ѐ-ӿ]/. Any Cyrillic
 *   character in dialogue.text → skip dialogue (Veo handles English audio best).
 * - grain/grade: "subtle grain, naturalistic grade" appended to [Style] as
 *   Veo-grammar staples per SKILL.md ("fine grain" in the fisherman example),
 *   UNLESS the assembled [Style] content already contains grain/grade/grading
 *   vocabulary (avoids duplicate mentions).
 */

import {
  CAMERA_VERB,
  DEFAULT_AVOID,
  DEFAULT_PACING_LINE,
  containsCyrillic,
} from './_seedance-shared';
import type { CharacterInScene, VideoPromptInput, VideoPromptOutput } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if text already contains grain, grade, or grading vocabulary */
function alreadyHasGrainOrGrade(text: string | undefined): boolean {
  if (!text) return false;
  return /\bgrain\b|\bgrade\b|\bgrading\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Block builders — Veo 3.1 specific (NOT reused from _seedance-shared)
// ---------------------------------------------------------------------------

/**
 * [Cinematography] block
 *
 * Format: "<Verb>, <speed>, <lens_character> lens, 24fps."
 * Fallback: "Static framing, 24fps."
 *
 * fps is fixed to 24 today. Schema-driven fps will be added in a future phase.
 */
function buildCinematographyBlock(input: VideoPromptInput): string {
  const { camera_movement } = input.scene;

  // fps note: "24fps cinematic" steers Veo toward the cinematic cadence.
  // No fps field in VideoPromptSceneInput today — schema-driven fps is a future phase.
  const FPS = '24fps cinematic';

  if (!camera_movement) {
    return `[Cinematography]\nStatic framing, ${FPS}.`;
  }

  const verb = CAMERA_VERB[camera_movement.kind];
  const speed = camera_movement.speed ?? 'medium';
  const lensPart = camera_movement.lens_character ? `, ${camera_movement.lens_character} lens` : '';

  return `[Cinematography]\n${verb}, ${speed}${lensPart}, ${FPS}.`;
}

/**
 * [Subject] block
 *
 * Format: one line per character "<Name> — <description>; @Image1."
 * For multi-character: join with "; " on a single line.
 * @Image1 always referenced (first frame is the visual anchor).
 *
 * Fallback when no characters: "Subject as established in @Image1."
 */
function buildSubjectBlock(input: VideoPromptInput): string {
  const chars: CharacterInScene[] = input.characters_in_scene ?? [];

  if (chars.length === 0) {
    return '[Subject]\nSubject as established in @Image1.';
  }

  const charParts = chars.map((c) => `${c.name} — ${c.description}`).join('; ');
  return `[Subject]\n${charParts}; @Image1.`;
}

/**
 * [Action] block
 *
 * Format: description_en (or description fallback) as a single paragraph.
 * No time-segments — Veo grammar is dense semantic, not time-segmented.
 *
 * Dialogue is appended only when:
 *   - audio_mode === 'native'
 *   - scene.dialogue is non-null
 *   - dialogue.text contains NO Cyrillic characters (English-only heuristic)
 *
 * Format for dialogue: `Dialogue: <speaker> — "<text>"`
 */
function buildActionBlock(input: VideoPromptInput): string {
  const desc = input.scene.description_en ?? input.scene.description;
  const lines: string[] = [desc];

  // Dialogue — only for native audio + pure-English text
  if (
    input.audio_mode === 'native' &&
    input.scene.dialogue !== null &&
    input.scene.dialogue !== undefined &&
    !containsCyrillic(input.scene.dialogue.text)
  ) {
    const { speaker, text } = input.scene.dialogue;
    lines.push(`Dialogue: ${speaker} — "${text}"`);
  }

  return `[Action]\n${lines.join('\n')}`;
}

/**
 * [Context] block
 *
 * Format: comma-joined sentence from:
 *   - lighting.recipe
 *   - lighting.time_of_day
 *   - visual_theme.mood
 *
 * Fallback: "Naturalistic ambient context."
 */
function buildContextBlock(input: VideoPromptInput): string {
  const { lighting } = input.scene;
  const mood = input.visual_theme?.mood;

  const parts: string[] = [];
  if (lighting?.recipe) parts.push(lighting.recipe);
  if (lighting?.time_of_day) parts.push(lighting.time_of_day);
  if (mood) parts.push(`${mood} mood`);

  if (parts.length === 0) {
    return '[Context]\nNaturalistic ambient context.';
  }

  return `[Context]\n${parts.join(', ')}.`;
}

/**
 * [Style] block
 *
 * Format: comma-joined sentence from:
 *   - visual_theme.film_look
 *   - visual_theme.lens
 *   - visual_theme.motion
 *   - "subtle grain, naturalistic grade" (Veo-grammar staples) — appended
 *     only when the assembled content does NOT already contain grain/grade/
 *     grading vocabulary (avoids duplicate mentions, e.g. "35mm fine grain,
 *     subtle grain").
 *
 * Fallback when visual_theme entirely absent: DEFAULT_PACING_LINE.
 * DEFAULT_PACING_LINE contains "grading", so the staples are NOT appended
 * in the fallback path (same dedupe rule applies).
 */
function buildStyleBlock(input: VideoPromptInput): string {
  const vt = input.visual_theme;

  // Veo-grammar staples per SKILL.md pattern ("fine grain" in the fisherman example).
  // Skipped when the assembled content already mentions grain/grade/grading.
  const STYLE_STAPLES = 'subtle grain, naturalistic grade';

  if (!vt) {
    // Fallback: DEFAULT_PACING_LINE already contains "grading" — skip staples.
    const content = alreadyHasGrainOrGrade(DEFAULT_PACING_LINE)
      ? `${DEFAULT_PACING_LINE}.`
      : `${DEFAULT_PACING_LINE}, ${STYLE_STAPLES}.`;
    return `[Style]\n${content}`;
  }

  const parts: string[] = [];
  if (vt.film_look) parts.push(vt.film_look);
  if (vt.lens) parts.push(vt.lens);
  if (vt.motion) parts.push(vt.motion);

  const joined = parts.join(', ');
  const finalContent = alreadyHasGrainOrGrade(joined)
    ? `${joined}.`
    : `${joined}, ${STYLE_STAPLES}.`;

  return `[Style]\n${finalContent}`;
}

/**
 * Avoid: line
 *
 * Decision: EMIT for Veo 3.1.
 * SKILL.md's Veo example omits it, but: (a) the broader prompt contract
 * (F70) recommends it, (b) task spec says "emit it" when SKILL.md is silent,
 * (c) consistency with Seedance + safety.
 */
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
 * Builds a Veo 3.1 block grammar prompt for image-to-video generation.
 *
 * Output structure:
 *   [Cinematography] camera + fps
 *   [Subject]        character descriptions + @Image1
 *   [Action]         scene narrative + optional English dialogue
 *   [Context]        lighting + time of day + mood
 *   [Style]          film look + lens + motion + grain/grade
 *   Avoid:           negative list
 */
export function buildVeo31Prompt(input: VideoPromptInput): VideoPromptOutput {
  const blocks = [
    buildCinematographyBlock(input),
    buildSubjectBlock(input),
    buildActionBlock(input),
    buildContextBlock(input),
    buildStyleBlock(input),
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
