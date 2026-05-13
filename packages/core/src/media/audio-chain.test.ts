import { describe, expect, it } from 'vitest';
import {
  AUDIO_CHAIN_COST_HINT_USD,
  type ChainScene,
  planNextChainStep,
} from './audio-chain';

const baseScene: ChainScene = {
  scene_id: 's1',
  audio_mode: 'auto',
  video_versions: [],
  video_active_version_id: null,
  voice_audio_versions: [],
  voice_audio_active_version_id: null,
  final_clip: null,
  model_meta: { has_native_audio: false },
};

const cyrillicDialogue = { speaker: 'narrator', text: 'Привет, мир.' };
const latinDialogue = { speaker: 'narrator', text: 'Hello world.' };

describe('planNextChainStep', () => {
  it('returns null when there is no dialogue', () => {
    expect(planNextChainStep(baseScene, null)).toBeNull();
  });

  it('returns null for empty dialogue text', () => {
    expect(planNextChainStep(baseScene, { speaker: 'narrator', text: '   ' })).toBeNull();
  });

  it('returns null when there is no active video yet', () => {
    expect(planNextChainStep(baseScene, cyrillicDialogue)).toBeNull();
  });

  it('plans voice when Cyrillic dialogue + video + no voice', () => {
    const scene: ChainScene = {
      ...baseScene,
      video_versions: [{ version_id: 'v1' }],
      video_active_version_id: 'v1',
    };
    expect(planNextChainStep(scene, cyrillicDialogue)).toEqual({ kind: 'voice' });
  });

  it('plans final_clip when Cyrillic + video + voice + no final_clip', () => {
    const scene: ChainScene = {
      ...baseScene,
      video_versions: [{ version_id: 'v1' }],
      video_active_version_id: 'v1',
      voice_audio_versions: [{ version_id: 'a1' }],
      voice_audio_active_version_id: 'a1',
    };
    expect(planNextChainStep(scene, cyrillicDialogue)).toEqual({
      kind: 'final_clip',
      video_version_id: 'v1',
      voice_audio_version_id: 'a1',
    });
  });

  it('plans final_clip when final_clip is stale relative to active video', () => {
    const scene: ChainScene = {
      ...baseScene,
      video_versions: [{ version_id: 'v1' }, { version_id: 'v2' }],
      video_active_version_id: 'v2',
      voice_audio_versions: [{ version_id: 'a1' }],
      voice_audio_active_version_id: 'a1',
      final_clip: {
        composed_from: { video_version_id: 'v1', voice_audio_version_id: 'a1' },
      },
    };
    expect(planNextChainStep(scene, cyrillicDialogue)).toEqual({
      kind: 'final_clip',
      video_version_id: 'v2',
      voice_audio_version_id: 'a1',
    });
  });

  it('returns null when chain is complete and fresh', () => {
    const scene: ChainScene = {
      ...baseScene,
      video_versions: [{ version_id: 'v1' }],
      video_active_version_id: 'v1',
      voice_audio_versions: [{ version_id: 'a1' }],
      voice_audio_active_version_id: 'a1',
      final_clip: {
        composed_from: { video_version_id: 'v1', voice_audio_version_id: 'a1' },
      },
    };
    expect(planNextChainStep(scene, cyrillicDialogue)).toBeNull();
  });

  it('plans final_clip native-passthrough when audio_mode=native + Cyrillic + video', () => {
    const scene: ChainScene = {
      ...baseScene,
      audio_mode: 'native',
      video_versions: [{ version_id: 'v1' }],
      video_active_version_id: 'v1',
    };
    expect(planNextChainStep(scene, cyrillicDialogue)).toEqual({
      kind: 'final_clip',
      video_version_id: 'v1',
      voice_audio_version_id: null,
    });
  });

  it('returns null when audio_mode=native and native final_clip already exists', () => {
    const scene: ChainScene = {
      ...baseScene,
      audio_mode: 'native',
      video_versions: [{ version_id: 'v1' }],
      video_active_version_id: 'v1',
      final_clip: {
        composed_from: { video_version_id: 'v1', voice_audio_version_id: null },
      },
    };
    expect(planNextChainStep(scene, cyrillicDialogue)).toBeNull();
  });

  it('returns null for Latin dialogue with native-capable model (auto→native)', () => {
    const scene: ChainScene = {
      ...baseScene,
      video_versions: [{ version_id: 'v1' }],
      video_active_version_id: 'v1',
      model_meta: { has_native_audio: true },
    };
    expect(planNextChainStep(scene, latinDialogue)).toEqual({
      kind: 'final_clip',
      video_version_id: 'v1',
      voice_audio_version_id: null,
    });
  });

  it('plans voice for Latin dialogue with audio_mode=silent_tts override', () => {
    const scene: ChainScene = {
      ...baseScene,
      audio_mode: 'silent_tts',
      video_versions: [{ version_id: 'v1' }],
      video_active_version_id: 'v1',
      model_meta: { has_native_audio: true },
    };
    expect(planNextChainStep(scene, latinDialogue)).toEqual({ kind: 'voice' });
  });

  it('exposes the cost hint constant', () => {
    expect(AUDIO_CHAIN_COST_HINT_USD).toBeCloseTo(0.06, 2);
  });
});
