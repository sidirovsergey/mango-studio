import { describe, expect, it } from 'vitest';
import { downgradeScript, upgradeScene, upgradeScript } from './migration';

const legacyScene = {
  scene_id: 's1',
  description: 'd',
  dialogue: { speaker: 'narrator', text: 'hi' },
  character_ids: [],
  duration_sec: 5,
  first_frame_source: 'auto_continuity',
  first_frame: {
    storage: { kind: 'fal_passthrough', url: 'https://fal.media/f.jpg' },
    model: 'm',
    generated_at: 'now',
    source: 'ai_text2img',
  },
  video: null,
  last_frame: null,
  final_clip: null,
};

describe('upgradeScene', () => {
  it('wraps first_frame into first_frame_versions array', () => {
    const r = upgradeScene(legacyScene as any);
    expect(r.first_frame_versions).toHaveLength(1);
    expect(r.first_frame_active_version_id).toBeTruthy();
    expect(r.first_frame_versions[0]!.version_id).toBe(r.first_frame_active_version_id);
  });

  it('wraps null video into empty array + null active', () => {
    const r = upgradeScene(legacyScene as any);
    expect(r.video_versions).toEqual([]);
    expect(r.video_active_version_id).toBeNull();
  });

  it('sets audio_mode auto when missing', () => {
    const r = upgradeScene(legacyScene as any);
    expect(r.audio_mode).toBe('auto');
  });

  it('voice_audio_versions empty array (legacy projects had no voice)', () => {
    const r = upgradeScene(legacyScene as any);
    expect(r.voice_audio_versions).toEqual([]);
  });
});

describe('upgradeScript', () => {
  const legacyScript = {
    title: 'X',
    genre: 'comedy',
    mood: 'light',
    target_audience: 'kids',
    logline: 'l',
    synopsis: 's',
    narrator_voice: { voice_id: 'v', voice_label: 'L' },
    characters: [],
    scenes: [legacyScene],
    master_clip: {
      storage: { kind: 'fal_passthrough', url: 'https://fal.media/m.mp4' },
      generated_at: 'now',
      scene_ids_snapshot: ['s1'],
    },
  };

  it('wraps master_clip into master_clip_versions', () => {
    const r = upgradeScript(legacyScript as any);
    expect(r.master_clip_versions).toHaveLength(1);
    expect(r.master_clip_active_version_id).toBeTruthy();
  });

  it('drops legacy master_clip key', () => {
    const r = upgradeScript(legacyScript as any);
    expect(r).not.toHaveProperty('master_clip');
  });

  it('migrates each scene', () => {
    const r = upgradeScript(legacyScript as any);
    expect(r.scenes[0]!.first_frame_versions).toHaveLength(1);
  });
});

describe('downgradeScript (rollback)', () => {
  const legacyScript = {
    title: 'X',
    genre: 'comedy',
    mood: 'light',
    target_audience: 'kids',
    logline: 'l',
    synopsis: 's',
    narrator_voice: { voice_id: 'v', voice_label: 'L' },
    characters: [],
    scenes: [legacyScene],
    master_clip: {
      storage: { kind: 'fal_passthrough', url: 'https://fal.media/m.mp4' },
      generated_at: 'now',
      scene_ids_snapshot: ['s1'],
    },
  };

  it('extracts active first_frame back to single field', () => {
    const upgraded = upgradeScript({ ...legacyScript } as any);
    const downgraded = downgradeScript(upgraded) as any;
    expect(downgraded.scenes[0]!.first_frame).toBeTruthy();
    expect(downgraded.scenes[0]!).not.toHaveProperty('first_frame_versions');
  });
});
