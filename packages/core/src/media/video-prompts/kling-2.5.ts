import type { VideoPromptInput, VideoPromptOutput } from './types';

/**
 * Stub for Kling 2.5 builder (handles both standard and pro variants).
 * Real grammar (beat-marked timeline format) implemented in T5.
 */
export function buildKling25Prompt(input: VideoPromptInput): VideoPromptOutput {
  return {
    prompt: '[kling-2.5 placeholder]',
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
