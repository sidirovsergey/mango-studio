/**
 * Kling 2.5 beat-marked timeline prompt builder.
 *
 * Implements the beat-marked timeline grammar described in
 * prompt-engineering-baseline/SKILL.md §"Kling 3.0 — beat-marked timeline".
 * (Kling 2.5 standard/pro variants use the same grammar family; the SKILL.md
 * predates the registry's v2.5 variant — grammar is treated as authoritative.)
 *
 * Addresses audit finding F65: per-engine prompt (not a generic paragraph).
 *
 * Format:
 *   (optional) Framing: <shot>, <angle>
 *   [MM:SS–MM:SS] <action> — <camera-verb-context> — <subject-cue>
 *   ... (N beats)
 *
 *   Audio: ...
 *   Style: ...
 *   Avoid: ...
 *   Reference: @Image1
 *
 * Beat count rules:
 *   ≤5s   → 1 beat [00:00–00:NN]
 *   6–9s  → 2 beats (split at ~40% of duration)
 *   10s   → 3 beats: [00:00–00:03], [00:03–00:07], [00:07–00:10]
 *   11–12s → 3 beats: [00:00–00:04], [00:04–00:08], [00:08–00:NN]
 *
 * Audio line contract (IMPORTANT):
 *   Kling 2.5 has `has_native_audio: false` — it cannot render TTS dialogue or
 *   music natively. The Audio: line is EDITORIAL GUIDANCE for the post-production
 *   editor describing what audio WOULD play if mixed. It is NOT an instruction
 *   to the model to synthesize audio.
 *
 * Imports from _seedance-shared.ts:
 *   - CAMERA_VERB (cinematic verb mapping — identical across engines)
 *   - SHOT_SIZE_LABEL, ANGLE_LABEL (framing labels)
 *   - DEFAULT_AVOID (engine-agnostic negative list)
 *   - DEFAULT_PACING_LINE (style fallback)
 *   (Seedance block builders are NOT imported — Kling uses a different format)
 */

import {
  ANGLE_LABEL,
  CAMERA_VERB,
  DEFAULT_AVOID,
  DEFAULT_PACING_LINE,
  SHOT_SIZE_LABEL,
} from './_seedance-shared';
import type { VideoPromptInput, VideoPromptOutput } from './types';

// ---------------------------------------------------------------------------
// Audio cue positioning constants (editorial guidance — Kling has no native audio).
// These positions are heuristics for the post-production editor; they're not
// instructions to the model. Tuning these requires updating kling-2.5.test.ts
// expected timestamps as well.
// ---------------------------------------------------------------------------
const KLING_AMBIENT_POSITION_SEC = 0;
const KLING_MUSIC_FIXED_POSITION_SEC = 2;
const KLING_MUSIC_FIXED_THRESHOLD_SEC = 8;
const KLING_MUSIC_SHORT_FRACTION = 0.25;
const KLING_SFX_FRACTION = 0.7;

// ---------------------------------------------------------------------------
// Beat timing helpers
// ---------------------------------------------------------------------------

/** Computes [startSec, endSec] tuples for the beat-marked timeline. */
function klingBeats(durationSec: number): Array<[number, number]> {
  if (durationSec <= 5) {
    return [[0, durationSec]];
  }
  if (durationSec === 10) {
    return [
      [0, 3],
      [3, 7],
      [7, 10],
    ];
  }
  if (durationSec <= 9) {
    // 2-segment split: ~40% / 60%
    const mid = Math.round(durationSec * 0.4);
    return [
      [0, mid],
      [mid, durationSec],
    ];
  }
  // 11–12s: 3 beats (0–4, 4–8, 8–end)
  return [
    [0, 4],
    [4, 8],
    [8, durationSec],
  ];
}

/** Zero-pads seconds to MM:SS format (e.g. 5 → "00:05"). */
function toMMSS(sec: number): string {
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Formats a beat timestamp using en-dash U+2013. */
function formatBeatTimestamp(start: number, end: number): string {
  return `[${toMMSS(start)}–${toMMSS(end)}]`;
}

// ---------------------------------------------------------------------------
// Beat line builder
// ---------------------------------------------------------------------------

/** Subject cue labels per beat index. */
const SUBJECT_CUES = ['acts', 'reacts', 'concludes'];

/**
 * Builds all beat lines for the timeline.
 *
 * Each line: [MM:SS–MM:SS] <action> — <camera-verb-context> — <subject-cue>
 * If no characters in scene, the third dash-segment is omitted entirely.
 */
function buildBeatLines(input: VideoPromptInput): string[] {
  const { scene } = input;
  const desc = scene.description_en ?? scene.description;
  const beats = klingBeats(scene.duration_sec);
  const chars = input.characters_in_scene ?? [];

  // NOTE: same sentence-distribution heuristic as _seedance-shared.ts buildActionBlock.
  // Kept inline because Kling's beat semantics are likely to diverge (e.g. cinematic
  // verb fallback per beat-role instead of generic continuation). DRYing now would
  // invite a leaky abstraction.
  const sentences = desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Camera context: same on every beat (camera doesn't change mid-shot)
  const cam = scene.camera_movement;
  let cameraContext: string;
  if (!cam) {
    cameraContext = 'Static';
  } else {
    const verb = CAMERA_VERB[cam.kind];
    const speedPart = cam.speed ? ` (${cam.speed})` : '';
    const lensPart = cam.lens_character ? ` — ${cam.lens_character}` : '';
    cameraContext = `${verb}${speedPart}${lensPart}`;
  }

  return beats.map(([start, end], i) => {
    const timestamp = formatBeatTimestamp(start, end);
    const action = sentences[i] ?? 'continued action from previous beat';

    if (chars.length === 0) {
      // Omit subject-cue segment entirely
      return `${timestamp} ${action} — ${cameraContext}`;
    }

    // 4+ beat fallback is currently unreachable; klingBeats caps at 3 beats. Defensive.
    const subjectCueVerb = SUBJECT_CUES[i] ?? 'continues';
    const subjectCue = `${chars[0]!.name} ${subjectCueVerb}`;
    return `${timestamp} ${action} — ${cameraContext} — ${subjectCue}`;
  });
}

// ---------------------------------------------------------------------------
// Framing line (optional, before first beat)
// ---------------------------------------------------------------------------

function buildFramingLine(input: VideoPromptInput): string | null {
  const { composition } = input.scene;
  if (!composition?.shot_size || !composition?.angle) return null;
  const shotLabel = SHOT_SIZE_LABEL[composition.shot_size];
  const angleLabel = ANGLE_LABEL[composition.angle];
  return `Framing: ${shotLabel}, ${angleLabel}`;
}

// ---------------------------------------------------------------------------
// Audio line
//
// EDITORIAL GUIDANCE ONLY — Kling 2.5 has no native audio output.
// This line tells the post-production editor what audio should be mixed in.
// ---------------------------------------------------------------------------

function buildAudioLine(input: VideoPromptInput): string {
  const { audio_mode, scene } = input;

  // silent_tts: explicit editorial notice for post-production mixer
  if (audio_mode === 'silent_tts') {
    // em-dash U+2014 in the message per spec
    return 'Audio: No native dialogue or music — voice dubbed in post; ambient room tone only';
  }

  const ad = scene.audio_direction;
  if (!ad || (!ad.ambient && !ad.music && (!ad.sfx || ad.sfx.length === 0))) {
    return 'Audio: ambient naturalistic tone';
  }

  const dur = scene.duration_sec;
  const cues: string[] = [];

  // Ambient at t=0
  if (ad.ambient) {
    cues.push(`[${toMMSS(KLING_AMBIENT_POSITION_SEC)}] ${ad.ambient}`);
  }

  // Music cue: fixed [00:02] for duration >= 8s; at ~25% for shorter scenes
  if (ad.music) {
    const musicSec =
      dur >= KLING_MUSIC_FIXED_THRESHOLD_SEC
        ? KLING_MUSIC_FIXED_POSITION_SEC
        : Math.round(dur * KLING_MUSIC_SHORT_FRACTION);
    cues.push(`[${toMMSS(musicSec)}] ${ad.music}`);
  }

  // SFX[0] at ~70% of duration
  if (ad.sfx && ad.sfx.length > 0) {
    const sfxSec = Math.round(dur * KLING_SFX_FRACTION);
    cues.push(`[${toMMSS(sfxSec)}] ${ad.sfx[0]}`);
  }

  return `Audio: ${cues.join('; ')}`;
}

// ---------------------------------------------------------------------------
// Style line
// ---------------------------------------------------------------------------

function buildStyleLine(input: VideoPromptInput): string {
  const vt = input.visual_theme;
  if (!vt?.film_look) {
    return `Style: ${DEFAULT_PACING_LINE}`;
  }

  const parts: string[] = [vt.film_look];
  if (vt.lens) parts.push(vt.lens);
  if (vt.motion) parts.push(vt.motion);
  return `Style: ${parts.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Avoid line
// ---------------------------------------------------------------------------

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
 * Builds a Kling 2.5 beat-marked timeline prompt for image-to-video generation.
 *
 * Output structure:
 *   (optional) Framing: <shot>, <angle>
 *   [MM:SS–MM:SS] beat 1 — camera — subject
 *   [MM:SS–MM:SS] beat 2 — camera — subject
 *   ...
 *
 *   Audio: <editorial audio guidance>
 *   Style: <film look or fallback>
 *   Avoid: <negative list>
 *   Reference: @Image1
 *
 * Note: Kling 2.5 has no native audio output (has_native_audio: false).
 * The Audio: line is editorial guidance for post-production, not a model directive.
 */
export function buildKling25Prompt(input: VideoPromptInput): VideoPromptOutput {
  const framingLine = buildFramingLine(input);
  const beatLines = buildBeatLines(input);

  // Beat section: optional Framing line followed by all beat lines
  const beatSectionParts: string[] = [];
  if (framingLine) beatSectionParts.push(framingLine);
  beatSectionParts.push(...beatLines);
  const beatSection = beatSectionParts.join('\n');

  // Footer section: Audio, Style, Avoid, Reference — each on its own line
  const footerLines = [
    buildAudioLine(input),
    buildStyleLine(input),
    buildAvoidLine(input),
    'Reference: @Image1',
  ];
  const footerSection = footerLines.join('\n');

  // Final prompt: beat section + blank line + footer section
  const prompt = `${beatSection}\n\n${footerSection}`;

  return {
    prompt,
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
