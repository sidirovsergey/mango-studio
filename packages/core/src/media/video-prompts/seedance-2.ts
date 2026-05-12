import {
  buildActionBlock,
  buildAvoidLine,
  buildCameraBlock,
  buildPacingBlock,
  buildSceneBlock,
  buildSubjectBlock,
} from './_seedance-shared';
import type { VideoPromptInput, VideoPromptOutput } from './types';

/**
 * Build [AUDIO] block.
 *
 * F66 fix: for silent_tts audio mode on a native-audio engine, emit a
 * quiet-bed directive so Seedance doesn't generate random ambient that
 * fights the TTS layer we add in post.
 *
 * For 'auto' mode: treat as 'native' — upstream should have resolved this
 * before reaching the builder, but we defend here anyway.
 *
 * NOTE: This builder stays in seedance-2.ts (not extracted to _seedance-shared)
 * because Seedance Lite has no native audio and emits NO [AUDIO] block at all.
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
