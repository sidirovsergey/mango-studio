import type { VideoPromptInput, VideoPromptOutput } from './types';

/**
 * Stub for Seedance 2.0 Pro builder.
 * Real grammar (Director Brief format, [SUBJECT]/[ACTION]/[AUDIO] blocks) implemented in T2.
 */
export function buildSeedance2Prompt(input: VideoPromptInput): VideoPromptOutput {
  return {
    prompt: '[seedance-2 placeholder]',
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
