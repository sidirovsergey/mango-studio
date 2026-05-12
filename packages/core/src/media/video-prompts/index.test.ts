import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVideoPrompt } from './index';

// Mock all engine builders — dispatcher routes, builders are tested separately (T2-T6)
vi.mock('./seedance-2', () => ({
  buildSeedance2Prompt: vi.fn().mockReturnValue({
    prompt: '[seedance-2 mock]',
    image_refs: [],
    duration_sec: 8,
    aspect_ratio: '9:16' as const,
  }),
}));

vi.mock('./seedance-lite', () => ({
  buildSeedanceLitePrompt: vi.fn().mockReturnValue({
    prompt: '[seedance-lite mock]',
    image_refs: [],
    duration_sec: 5,
    aspect_ratio: '9:16' as const,
  }),
}));

vi.mock('./veo-3.1', () => ({
  buildVeo31Prompt: vi.fn().mockReturnValue({
    prompt: '[veo-3.1 mock]',
    image_refs: [],
    duration_sec: 8,
    aspect_ratio: '9:16' as const,
  }),
}));

vi.mock('./kling-2.5', () => ({
  buildKling25Prompt: vi.fn().mockReturnValue({
    prompt: '[kling-2.5 mock]',
    image_refs: [],
    duration_sec: 5,
    aspect_ratio: '9:16' as const,
  }),
}));

vi.mock('./ltx', () => ({
  buildLtxPrompt: vi.fn().mockReturnValue({
    prompt: '[ltx mock]',
    image_refs: [],
    duration_sec: 5,
    aspect_ratio: '9:16' as const,
  }),
}));

vi.mock('./generic', () => ({
  buildGenericVideoPrompt: vi.fn().mockReturnValue({
    prompt: '[generic mock]',
    image_refs: [],
    duration_sec: 5,
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

describe('buildVideoPrompt dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes bytedance/seedance-2.0/image-to-video to buildSeedance2Prompt', async () => {
    const { buildSeedance2Prompt } = await import('./seedance-2');
    buildVideoPrompt(makeInput('bytedance/seedance-2.0/image-to-video'));
    expect(buildSeedance2Prompt).toHaveBeenCalledOnce();
  });

  it('routes fal-ai/bytedance/seedance/v1/lite/image-to-video to buildSeedanceLitePrompt', async () => {
    const { buildSeedanceLitePrompt } = await import('./seedance-lite');
    buildVideoPrompt(makeInput('fal-ai/bytedance/seedance/v1/lite/image-to-video'));
    expect(buildSeedanceLitePrompt).toHaveBeenCalledOnce();
  });

  it('routes fal-ai/veo3.1/image-to-video to buildVeo31Prompt', async () => {
    const { buildVeo31Prompt } = await import('./veo-3.1');
    buildVideoPrompt(makeInput('fal-ai/veo3.1/image-to-video'));
    expect(buildVeo31Prompt).toHaveBeenCalledOnce();
  });

  it('routes fal-ai/kling-video/v2.5-turbo/standard/image-to-video to buildKling25Prompt', async () => {
    const { buildKling25Prompt } = await import('./kling-2.5');
    buildVideoPrompt(makeInput('fal-ai/kling-video/v2.5-turbo/standard/image-to-video'));
    expect(buildKling25Prompt).toHaveBeenCalledOnce();
  });

  it('routes fal-ai/kling-video/v2.5-turbo/pro/image-to-video to buildKling25Prompt', async () => {
    const { buildKling25Prompt } = await import('./kling-2.5');
    buildVideoPrompt(makeInput('fal-ai/kling-video/v2.5-turbo/pro/image-to-video'));
    expect(buildKling25Prompt).toHaveBeenCalledOnce();
  });

  it('routes fal-ai/ltx-video to buildLtxPrompt', async () => {
    const { buildLtxPrompt } = await import('./ltx');
    buildVideoPrompt(makeInput('fal-ai/ltx-video'));
    expect(buildLtxPrompt).toHaveBeenCalledOnce();
  });

  it('falls back to buildGenericVideoPrompt for unknown model and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { buildGenericVideoPrompt } = await import('./generic');
    buildVideoPrompt(makeInput('unknown/mystery-model'));
    expect(buildGenericVideoPrompt).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[video-prompts] unknown model unknown/mystery-model'),
    );
    warnSpy.mockRestore();
  });

  it('passes the full input object through to the dispatched builder', async () => {
    const { buildSeedance2Prompt } = await import('./seedance-2');
    const input = makeInput('bytedance/seedance-2.0/image-to-video');
    buildVideoPrompt(input);
    expect(buildSeedance2Prompt).toHaveBeenCalledWith(input);
  });

  it('returns the VideoPromptOutput shape from the builder', () => {
    const result = buildVideoPrompt(makeInput('bytedance/seedance-2.0/image-to-video'));
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('image_refs');
    expect(result).toHaveProperty('duration_sec');
    expect(result).toHaveProperty('aspect_ratio', '9:16');
  });
});
