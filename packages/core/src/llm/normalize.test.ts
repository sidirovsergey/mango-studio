import { describe, it, expect } from 'vitest';
import { normalizeScene } from './normalize';

describe('normalizeScene', () => {
  it('passes through new schema unchanged', () => {
    const scene = {
      scene_id: 's1',
      description: 'Сцена',
      duration_sec: 8,
      dialogue: { speaker: 'narrator', text: 'Hello' },
      character_ids: ['c1'],
      first_frame_source: 'auto_continuity' as const,
      first_frame: null,
      last_frame: null,
      video: null,
      voice_audio: null,
      final_clip: null,
    };
    expect(normalizeScene(scene)).toEqual(scene);
  });

  it('converts legacy voiceover string into narrator dialogue', () => {
    const legacy = {
      scene_id: 's1',
      description: 'Сцена',
      duration_sec: 8,
      voiceover: 'Жил-был дельфин',
    };
    const result = normalizeScene(legacy);
    expect(result.dialogue).toEqual({ speaker: 'narrator', text: 'Жил-был дельфин' });
    expect(result.character_ids).toEqual([]);
    expect(result.first_frame_source).toBe('auto_continuity');
    expect(result.first_frame).toBeNull();
    expect(result.video).toBeNull();
    expect(result.final_clip).toBeNull();
    expect((result as Record<string, unknown>).voiceover).toBeUndefined();
  });

  it('returns null dialogue when legacy has empty voiceover', () => {
    const legacy = {
      scene_id: 's1',
      description: 'Сцена',
      duration_sec: 8,
      voiceover: '',
    };
    expect(normalizeScene(legacy).dialogue).toBeNull();
  });

  it('returns null dialogue when legacy missing voiceover entirely', () => {
    const legacy = { scene_id: 's1', description: 'Сцена', duration_sec: 8 };
    expect(normalizeScene(legacy).dialogue).toBeNull();
    expect(normalizeScene(legacy).character_ids).toEqual([]);
  });
});
