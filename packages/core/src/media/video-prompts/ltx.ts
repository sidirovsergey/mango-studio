/**
 * LTX Video permissive prompt builder.
 *
 * LTX is an open-source model that accepts loose natural-language prompts.
 * This builder emits a lightly-structured 3-section prompt to give it the
 * most important context without over-constraining.
 *
 * Output structure:
 *   Description: <scene description>
 *
 *   Camera: <verb> (<speed>) — <lens_character>
 *          (or "Camera: Static" if camera_movement absent)
 *
 *   Audio: <audio direction summary>
 *
 * Addresses audit finding F65: per-engine prompt (not a generic paragraph).
 *
 * Cyrillic-detection rule for dialogue: if dialogue.text contains any Cyrillic
 * characters, skip it (LTX behavior with non-English audio is unproven).
 *
 * Imports from _seedance-shared.ts:
 *   - CAMERA_VERB (cinematic verb mapping — identical across engines)
 */

import { CAMERA_VERB } from './_seedance-shared';
import type { VideoPromptInput, VideoPromptOutput } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the string contains any Cyrillic characters. */
function hasCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text);
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildDescriptionSection(input: VideoPromptInput): string {
  const desc = input.scene.description_en ?? input.scene.description;
  return `Description: ${desc}`;
}

function buildCameraSection(input: VideoPromptInput): string {
  const { camera_movement } = input.scene;

  if (!camera_movement) {
    return 'Camera: Static';
  }

  const verb = CAMERA_VERB[camera_movement.kind];
  const speedPart = camera_movement.speed ? ` (${camera_movement.speed})` : '';
  const lensPart = camera_movement.lens_character ? ` — ${camera_movement.lens_character}` : '';

  return `Camera: ${verb}${speedPart}${lensPart}`;
}

function buildAudioSection(input: VideoPromptInput): string {
  const { audio_mode, scene } = input;

  // silent_tts: explicit notice
  if (audio_mode === 'silent_tts') {
    return 'Audio: silent, voice dubbed in post';
  }

  const ad = scene.audio_direction;

  // Absent audio_direction → ambient naturalistic fallback
  if (!ad) {
    return 'Audio: ambient naturalistic tone';
  }

  // auto or native: build from audio_direction fields
  const parts: string[] = [];
  if (ad.music) parts.push(`Music: ${ad.music}`);
  if (ad.ambient) parts.push(`Ambient: ${ad.ambient}`);
  if (ad.sfx && ad.sfx.length > 0) parts.push(`SFX: ${ad.sfx[0]}`);

  // If all fields happen to be empty/absent, fall back to naturalistic
  if (parts.length === 0) {
    return 'Audio: ambient naturalistic tone';
  }

  let audioLine = `Audio: ${parts.join('. ')}`;

  // Append dialogue only for native mode + non-Cyrillic dialogue
  if (
    audio_mode === 'native' &&
    scene.dialogue !== null &&
    scene.dialogue !== undefined &&
    !hasCyrillic(scene.dialogue.text)
  ) {
    const { speaker, text } = scene.dialogue;
    // em-dash U+2014
    audioLine += `\nDialogue: ${speaker} — "${text}"`;
  }

  return audioLine;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Builds an LTX Video permissive prompt for image-to-video generation.
 *
 * Output structure (3 labeled sections joined with blank lines):
 *   Description: <scene description>
 *
 *   Camera: <movement + speed + lens> (or "Camera: Static")
 *
 *   Audio: <audio summary + optional dialogue>
 */
export function buildLtxPrompt(input: VideoPromptInput): VideoPromptOutput {
  const sections = [
    buildDescriptionSection(input),
    buildCameraSection(input),
    buildAudioSection(input),
  ];

  const prompt = sections.join('\n\n');

  return {
    prompt,
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
