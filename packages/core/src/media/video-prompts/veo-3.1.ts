import type { VideoPromptInput, VideoPromptOutput } from './types';

/**
 * Stub for Veo 3.1 builder.
 * Real grammar (block grammar format) implemented in T4.
 */
export function buildVeo31Prompt(input: VideoPromptInput): VideoPromptOutput {
  return {
    prompt: '[veo-3.1 placeholder]',
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
