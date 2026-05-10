import { describe, expect, it } from 'vitest';
import { masterClipStoragePath, sceneAssetStoragePath } from './storage-paths';

describe('sceneAssetStoragePath', () => {
  it('builds frame path', () => {
    const r = sceneAssetStoragePath({
      user_id: 'u1',
      project_id: 'p1',
      scene_id: 's1',
      version_id: 'v1',
      kind: 'first_frame',
      ext: 'jpg',
    });
    expect(r).toBe('u1/p1/s1/v1-frame.jpg');
  });
  it('builds video path', () => {
    const r = sceneAssetStoragePath({
      user_id: 'u1',
      project_id: 'p1',
      scene_id: 's1',
      version_id: 'v2',
      kind: 'video',
      ext: 'mp4',
    });
    expect(r).toBe('u1/p1/s1/v2-video.mp4');
  });
  it('builds voice path', () => {
    const r = sceneAssetStoragePath({
      user_id: 'u1',
      project_id: 'p1',
      scene_id: 's1',
      version_id: 'v3',
      kind: 'voice_audio',
      ext: 'mp3',
    });
    expect(r).toBe('u1/p1/s1/v3-voice.mp3');
  });
});

describe('masterClipStoragePath', () => {
  it('builds master path', () => {
    expect(
      masterClipStoragePath({ user_id: 'u1', project_id: 'p1', version_id: 'mv1', ext: 'mp4' }),
    ).toBe('u1/p1/master/mv1.mp4');
  });
});
