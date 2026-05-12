import {
  buildActionBlock,
  buildAvoidLine,
  buildCameraBlock,
  buildPacingBlock,
  buildSceneBlock,
  buildSubjectBlock,
} from './_seedance-shared';
import type { VideoPromptInput, VideoPromptOutput } from './types';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Builds a Seedance Lite Director Brief for image-to-video generation.
 *
 * Seedance Lite is the economy-tier model; it has NO native audio capability
 * (meta.has_native_audio === false). Therefore the [AUDIO] block is entirely
 * absent — audio_mode and audio_direction from the input are ignored.
 *
 * Block order (6 blocks, NO [AUDIO]):
 * [SCENE] → [SUBJECT] → [ACTION] → [CAMERA] → [Pacing/Style] → Avoid:
 *
 * Addresses audit findings:
 * - F65: Engine-specific prompt (not the generic paragraph)
 * - F67: Time-segmented prompts for >5s scenes
 * - F68: Real camera verbs from camera_movement.kind enum
 * - F70: Negative prompt (Avoid: line)
 * - F71: [Pacing/Style] color-grade line from visual_theme.film_look
 */
export function buildSeedanceLitePrompt(input: VideoPromptInput): VideoPromptOutput {
  const blocks = [
    buildSceneBlock(input),
    buildSubjectBlock(input),
    buildActionBlock(input),
    buildCameraBlock(input),
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
