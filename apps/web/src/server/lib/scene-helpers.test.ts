import { normalizeScene } from '@mango/core';
import { describe, expect, it } from 'vitest';
import {
  applyAssetToScript,
  applyMasterClipToScript,
  cascadeFirstFrameStale,
  isMasterClipStale,
} from './scene-helpers';

const baseScript = {
  title: 'Test',
  scenes: [
    normalizeScene({ scene_id: 's1', description: '...', duration_sec: 5 }),
    normalizeScene({ scene_id: 's2', description: '...', duration_sec: 5 }),
    normalizeScene({ scene_id: 's3', description: '...', duration_sec: 5 }),
  ],
  characters: [],
  master_clip: null,
};

describe('applyAssetToScript', () => {
  it('sets first_frame on matching scene', () => {
    const updated = applyAssetToScript(baseScript, {
      scene_id: 's2',
      kind: 'first_frame',
      asset: {
        storage: { kind: 'fal_passthrough', url: 'https://x' },
        model: 'fal-ai/nano-banana-pro',
        generated_at: '2026-05-02T12:00:00Z',
        source: 'ai_text2img',
      },
    });
    expect(updated.scenes[1]!.first_frame?.storage).toEqual({
      kind: 'fal_passthrough',
      url: 'https://x',
    });
    expect(updated.scenes[0]!.first_frame).toBeNull();
  });

  it('sets video and adopts has_native_audio from input', () => {
    const updated = applyAssetToScript(baseScript, {
      scene_id: 's1',
      kind: 'video',
      asset: {
        storage: { kind: 'fal_passthrough', url: 'https://v' },
        model: 'bytedance/seedance-2.0/image-to-video',
        generated_at: 'now',
        fal_request_id: 'req',
        duration_sec: 8,
        source: 'ai_img2vid',
        has_native_audio: true,
      },
    });
    expect(updated.scenes[0]!.video?.has_native_audio).toBe(true);
  });

  it('throws when scene_id not found', () => {
    expect(() =>
      applyAssetToScript(baseScript, {
        scene_id: 'unknown',
        kind: 'first_frame',
        asset: {
          storage: { kind: 'fal_passthrough', url: 'https://x' },
          model: 'm',
          generated_at: 'now',
        },
      }),
    ).toThrow(/scene not found/);
  });
});

describe('applyMasterClipToScript', () => {
  it('sets master_clip on script root', () => {
    const updated = applyMasterClipToScript(baseScript, {
      storage: { kind: 'fal_passthrough', url: 'https://m' },
      generated_at: 'now',
      scene_ids_snapshot: ['s1', 's2', 's3'],
    });
    expect(updated.master_clip?.scene_ids_snapshot).toHaveLength(3);
  });
});

describe('cascadeFirstFrameStale', () => {
  it('marks next scene first_frame stale when previous video changes', () => {
    const withFirstFrame = applyAssetToScript(baseScript, {
      scene_id: 's2',
      kind: 'first_frame',
      asset: {
        storage: { kind: 'fal_passthrough', url: 'https://ff' },
        model: 'm',
        generated_at: 'now',
        source: 'ai_img2img_continuity',
      },
    });
    const cascaded = cascadeFirstFrameStale(withFirstFrame, 's1');
    expect(cascaded.scenes[1]!.first_frame?.stale).toBe(true);
  });

  it('does nothing when next scene has no first_frame yet', () => {
    const result = cascadeFirstFrameStale(baseScript, 's1');
    expect(result.scenes[1]!.first_frame).toBeNull();
  });

  it('does nothing for last scene', () => {
    const result = cascadeFirstFrameStale(baseScript, 's3');
    expect(result).toEqual(baseScript);
  });
});

describe('isMasterClipStale', () => {
  it('returns false when no master_clip', () => {
    expect(isMasterClipStale(baseScript)).toBe(false);
  });

  it('returns true when scene_ids_snapshot drifts', () => {
    const withMaster = applyMasterClipToScript(baseScript, {
      storage: { kind: 'fal_passthrough', url: 'https://m' },
      generated_at: '2026-05-02T12:00:00Z',
      scene_ids_snapshot: ['s1', 's2'],
    });
    expect(isMasterClipStale(withMaster)).toBe(true);
  });
});
