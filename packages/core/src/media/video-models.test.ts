import { describe, expect, it } from 'vitest';
import {
  CONCAT_MODEL,
  EXTRACT_LAST_FRAME_MODEL,
  MUX_MODEL,
  VOICE_MODELS,
  clampDurationToModel,
  getDefaultVideoModel,
  getVideoModelMeta,
  isVideoModelInTier,
} from './video-models';

describe('VIDEO_MODELS registry', () => {
  it('has Seedance 2.0 as default for both economy and premium', () => {
    // 2026-05-26: economy swapped from Grok to Seedance 2.0 after Grok
    // showed 24% completion rate via fal-partner (concurrent throttle).
    // See video-models.ts comment block on VIDEO_MODELS for full context.
    expect(getDefaultVideoModel('economy')).toBe('bytedance/seedance-2.0/image-to-video');
    expect(getDefaultVideoModel('premium')).toBe('bytedance/seedance-2.0/image-to-video');
  });

  it('returns metadata for known model', () => {
    const meta = getVideoModelMeta('bytedance/seedance-2.0/image-to-video');
    expect(meta?.tier).toBe('premium');
    expect(meta?.has_native_audio).toBe(true);
    expect(meta?.duration_options).toContain(8);
  });

  it('returns null for unknown model', () => {
    expect(getVideoModelMeta('fal-ai/unknown/model')).toBeNull();
  });

  it('checks if model belongs to active tier set', () => {
    // Active economy = Seedance 2.0 default + Grok as alternative.
    expect(isVideoModelInTier('bytedance/seedance-2.0/image-to-video', 'economy')).toBe(true);
    expect(isVideoModelInTier('xai/grok-imagine-video/image-to-video', 'economy')).toBe(true);
    // Active premium = Seedance 2.0 default + Veo 3.1 alt + Grok alt.
    expect(isVideoModelInTier('xai/grok-imagine-video/image-to-video', 'premium')).toBe(true);
    expect(isVideoModelInTier('bytedance/seedance-2.0/image-to-video', 'premium')).toBe(true);
    expect(isVideoModelInTier('fal-ai/veo3.1/image-to-video', 'premium')).toBe(true);
    // Legacy models stay parsed via getVideoModelMeta but are no longer in
    // active sets.
    expect(isVideoModelInTier('fal-ai/bytedance/seedance/v1/lite/image-to-video', 'economy')).toBe(
      false,
    );
    expect(isVideoModelInTier('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', 'premium')).toBe(
      false,
    );
  });
});

describe('clampDurationToModel', () => {
  it('returns nearest supported duration', () => {
    expect(clampDurationToModel('fal-ai/veo3.1/image-to-video', 5)).toBe(8);
    expect(clampDurationToModel('fal-ai/veo3.1/image-to-video', 12)).toBe(8);
  });

  it('returns exact value when supported', () => {
    expect(clampDurationToModel('bytedance/seedance-2.0/image-to-video', 8)).toBe(8);
  });

  it('snaps to nearest supported below if value falls between options', () => {
    // Seedance v1 lite supports [5, 10]
    expect(clampDurationToModel('fal-ai/bytedance/seedance/v1/lite/image-to-video', 7)).toBe(5);
    expect(clampDurationToModel('fal-ai/bytedance/seedance/v1/lite/image-to-video', 8)).toBe(10);
  });
});

describe('VOICE_MODELS', () => {
  it('has elevenlabs as default', () => {
    expect(VOICE_MODELS.economy.default).toContain('elevenlabs');
    expect(VOICE_MODELS.premium.default).toContain('elevenlabs');
  });
});

describe('MUX_MODEL / CONCAT_MODEL / EXTRACT_LAST_FRAME_MODEL', () => {
  it('exports fal ffmpeg-api slugs', () => {
    expect(MUX_MODEL).toBe('fal-ai/ffmpeg-api/merge-audio-video');
    expect(CONCAT_MODEL).toBe('fal-ai/ffmpeg-api/merge-videos');
    expect(EXTRACT_LAST_FRAME_MODEL).toBe('fal-ai/ffmpeg-api/extract-frame');
  });
});
