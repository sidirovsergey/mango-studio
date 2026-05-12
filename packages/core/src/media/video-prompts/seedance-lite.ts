import type { VideoPromptInput, VideoPromptOutput } from './types';

/**
 * Stub for Seedance Lite (economy) builder.
 * Real grammar implemented in T3.
 */
export function buildSeedanceLitePrompt(input: VideoPromptInput): VideoPromptOutput {
  return {
    prompt: '[seedance-lite placeholder]',
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
