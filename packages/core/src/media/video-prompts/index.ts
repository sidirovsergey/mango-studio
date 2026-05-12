import { buildGenericVideoPrompt } from './generic';
import { buildKling25Prompt } from './kling-2.5';
import { buildLtxPrompt } from './ltx';
import { buildSeedance2Prompt } from './seedance-2';
import { buildSeedanceLitePrompt } from './seedance-lite';
import type { VideoPromptInput, VideoPromptOutput } from './types';
import { buildVeo31Prompt } from './veo-3.1';

export type {
  VideoPromptInput,
  VideoPromptSceneInput,
  VideoPromptOutput,
  CharacterInScene,
} from './types';

export function buildVideoPrompt(input: VideoPromptInput): VideoPromptOutput {
  const { model } = input;
  if (model === 'bytedance/seedance-2.0/image-to-video') return buildSeedance2Prompt(input);
  if (model === 'fal-ai/bytedance/seedance/v1/lite/image-to-video')
    return buildSeedanceLitePrompt(input);
  if (model === 'fal-ai/veo3.1/image-to-video') return buildVeo31Prompt(input);
  if (model.startsWith('fal-ai/kling-video/v2.5-turbo/')) return buildKling25Prompt(input);
  if (model === 'fal-ai/ltx-video') return buildLtxPrompt(input);
  console.warn(`[video-prompts] unknown model ${model}; using generic builder`);
  return buildGenericVideoPrompt(input);
}
