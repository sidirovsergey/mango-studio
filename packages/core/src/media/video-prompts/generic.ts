import type { VideoPromptInput, VideoPromptOutput } from './types';

/**
 * Generic fallback builder for unknown models.
 * Used when no engine-specific builder matches the model id.
 * Real grammar implemented in T6 alongside LTX.
 */
export function buildGenericVideoPrompt(input: VideoPromptInput): VideoPromptOutput {
  return {
    prompt: '[generic placeholder]',
    image_refs: [input.first_frame_storage],
    duration_sec: input.scene.duration_sec,
    aspect_ratio: '9:16',
  };
}
