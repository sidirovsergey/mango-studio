/**
 * Generic fallback prompt builder for unknown video models.
 *
 * Used by the dispatcher when no engine-specific builder matches the model id.
 * Emits plain prose without any labels, block headers, dialogue, or @Image1
 * references — maximally model-agnostic output.
 *
 * Output structure (3 plain paragraphs joined with blank lines):
 *   <scene description>
 *
 *   <camera context>
 *
 *   <audio summary>   ← OMITTED when audio_direction absent or audio_mode === 'silent_tts'
 *
 * Addresses audit finding F65: per-engine prompt (not a generic paragraph).
 *
 * Imports from _seedance-shared.ts:
 *   - CAMERA_VERB (cinematic verb mapping — identical across engines)
 */

import { CAMERA_VERB } from './_seedance-shared';
import type { VideoPromptInput, VideoPromptOutput } from './types';

// ---------------------------------------------------------------------------
// Paragraph builders
// ---------------------------------------------------------------------------

function buildDescriptionParagraph(input: VideoPromptInput): string {
  return input.scene.description_en ?? input.scene.description;
}

function buildCameraParagraph(input: VideoPromptInput): string {
  const { camera_movement } = input.scene;

  if (!camera_movement) {
    return 'Static framing.';
  }

  const verb = CAMERA_VERB[camera_movement.kind];
  const speedPart = camera_movement.speed ? `, ${camera_movement.speed} speed` : '';
  const lensPart = camera_movement.lens_character ? `, ${camera_movement.lens_character}` : '';

  return `${verb} shot${speedPart}${lensPart}.`;
}

/**
 * Builds the audio paragraph from audio_direction fields.
 *
 * Returns null when:
 *   - audio_mode === 'silent_tts'
 *   - audio_direction is absent
 *   - all audio_direction fields are empty/absent
 *
 * No dialogue is ever emitted (unknown engine, no guarantee it handles audio).
 */
function buildAudioParagraph(input: VideoPromptInput): string | null {
  if (input.audio_mode === 'silent_tts') {
    return null;
  }

  const ad = input.scene.audio_direction;
  if (!ad) {
    return null;
  }

  const parts: string[] = [];
  if (ad.ambient) parts.push(`Ambient: ${ad.ambient}`);
  if (ad.music) parts.push(`Music: ${ad.music}`);
  if (ad.sfx && ad.sfx.length > 0) parts.push(`SFX: ${ad.sfx[0]}`);

  if (parts.length === 0) {
    return null;
  }

  return `${parts.join('. ')}.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Builds a plain prose fallback prompt for image-to-video generation
 * when no engine-specific builder matches the model id.
 *
 * Output: 2–3 plain paragraphs, no labels, no dialogue, no @Image1 references.
 */
export function buildGenericVideoPrompt(input: VideoPromptInput): VideoPromptOutput {
  const paragraphs: string[] = [buildDescriptionParagraph(input), buildCameraParagraph(input)];

  const audioParagraph = buildAudioParagraph(input);
  if (audioParagraph !== null) {
    paragraphs.push(audioParagraph);
  }

  const prompt = paragraphs.join('\n\n');

  return {
    prompt,
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
