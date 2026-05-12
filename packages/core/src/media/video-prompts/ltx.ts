import type { VideoPromptInput, VideoPromptOutput } from './types';

/**
 * Stub for LTX Video builder.
 * Real grammar (permissive, minimal constraints) implemented in T6.
 */
export function buildLtxPrompt(input: VideoPromptInput): VideoPromptOutput {
  return {
    prompt: '[ltx placeholder]',
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
