import { type SceneForAudio, type VideoModelMetaForAudio, resolveAudioMode } from './audio-mode';

export const AUDIO_CHAIN_COST_HINT_USD = 0.06;

export type ChainScene = {
  scene_id: string;
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  video_versions: { version_id: string }[];
  video_active_version_id: string | null;
  voice_audio_versions: { version_id: string }[];
  voice_audio_active_version_id: string | null;
  final_clip: {
    composed_from: {
      video_version_id: string;
      voice_audio_version_id: string | null;
    };
  } | null;
  model_meta: VideoModelMetaForAudio;
};

export type ChainStep =
  | null
  | { kind: 'voice' }
  | {
      kind: 'final_clip';
      video_version_id: string;
      voice_audio_version_id: string | null;
    };

type Dialogue = { speaker: string; text: string } | null;

/**
 * Decides the next reactive step in the per-scene audio pipeline.
 *
 * Called from `pollMediaJobsAction` after a video or voice job lands. Pure —
 * no I/O. Returns `null` when nothing to do (no dialogue, no video yet,
 * chain complete, or native passthrough already in place).
 */
export function planNextChainStep(scene: ChainScene, dialogue: Dialogue): ChainStep {
  if (!dialogue || !dialogue.text || !dialogue.text.trim()) return null;

  const videoVersionId = scene.video_active_version_id;
  if (!videoVersionId) return null;

  const sceneForAudio: SceneForAudio = {
    audio_mode: scene.audio_mode ?? 'auto',
    dialogue,
  };
  const mode = resolveAudioMode(sceneForAudio, scene.model_meta);

  if (mode === 'native') {
    if (
      scene.final_clip &&
      scene.final_clip.composed_from.video_version_id === videoVersionId &&
      scene.final_clip.composed_from.voice_audio_version_id === null
    ) {
      return null;
    }
    return {
      kind: 'final_clip',
      video_version_id: videoVersionId,
      voice_audio_version_id: null,
    };
  }

  const voiceVersionId = scene.voice_audio_active_version_id;
  if (!voiceVersionId) return { kind: 'voice' };

  if (
    scene.final_clip &&
    scene.final_clip.composed_from.video_version_id === videoVersionId &&
    scene.final_clip.composed_from.voice_audio_version_id === voiceVersionId
  ) {
    return null;
  }
  return {
    kind: 'final_clip',
    video_version_id: videoVersionId,
    voice_audio_version_id: voiceVersionId,
  };
}
