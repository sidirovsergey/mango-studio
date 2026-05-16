import { describe, expect, it, vi } from 'vitest';
import { buildVideoPrompt } from './index';

// Post-2026-05-13: the per-engine dispatcher was retired in favour of a
// single unified builder. Every model id is forwarded to the same code path
// (buildSeedance2Prompt under the hood). The legacy dispatcher tests are
// gone with the legacy builders.

vi.mock('./seedance-2', () => ({
  buildSeedance2Prompt: vi.fn().mockReturnValue({
    prompt: '[unified mock]',
    image_refs: [],
    duration_sec: 8,
    aspect_ratio: '9:16' as const,
  }),
}));

const baseFirstFrame = { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/ff.png' };

const baseScene = {
  scene_id: 's1',
  description: 'Дельфин машет плавником',
  duration_sec: 8,
  dialogue: null,
};

function makeInput(model: string) {
  return {
    model,
    scene: baseScene,
    first_frame_storage: baseFirstFrame,
    audio_mode: 'auto' as const,
  };
}

describe('buildVideoPrompt unified builder', () => {
  it('forwards every model id to the unified builder', async () => {
    const { buildSeedance2Prompt } = await import('./seedance-2');
    const activeModels = [
      'xai/grok-imagine-video/image-to-video',
      'bytedance/seedance-2.0/image-to-video',
      'fal-ai/veo3.1/image-to-video',
    ];
    for (const m of activeModels) {
      buildVideoPrompt(makeInput(m));
    }
    expect(buildSeedance2Prompt).toHaveBeenCalledTimes(activeModels.length);
  });

  it('forwards unknown model ids without dispatch branching', async () => {
    const { buildSeedance2Prompt } = await import('./seedance-2');
    vi.mocked(buildSeedance2Prompt).mockClear();
    buildVideoPrompt(makeInput('something/we-have-never-seen'));
    expect(buildSeedance2Prompt).toHaveBeenCalledOnce();
  });

  it('passes the full input object through verbatim', async () => {
    const { buildSeedance2Prompt } = await import('./seedance-2');
    vi.mocked(buildSeedance2Prompt).mockClear();
    const input = makeInput('xai/grok-imagine-video/image-to-video');
    buildVideoPrompt(input);
    expect(buildSeedance2Prompt).toHaveBeenCalledWith(input);
  });

  it('returns the VideoPromptOutput shape', () => {
    const result = buildVideoPrompt(makeInput('xai/grok-imagine-video/image-to-video'));
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('image_refs');
    expect(result).toHaveProperty('duration_sec');
    expect(result).toHaveProperty('aspect_ratio', '9:16');
  });
});
