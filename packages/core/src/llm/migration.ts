import { randomUUID } from 'node:crypto';
import type { Scene, Script } from './schemas';
import type { SceneAssetVersion, MasterClipVersion } from '../media/scene-types';

// Legacy types (loose — accept any shape from prior phases)
type LegacyScene = {
  scene_id: string;
  description: string;
  dialogue?: any;
  voiceover?: string;  // pre-1.3 — covered by existing normalize
  character_ids?: string[];
  composition_hint?: string;
  duration_sec: number;
  first_frame_source?: string;
  config_overrides?: any;
  audio_mode?: string;
  first_frame?: any;   // legacy single field
  video?: any;
  last_frame?: any;
  final_clip?: any;
};

type LegacyScript = {
  title: string;
  genre?: string;
  mood?: string;
  target_audience?: string;
  logline?: string;
  synopsis?: string;
  narrator_voice?: any;
  characters: any;
  scenes: LegacyScene[];
  master_clip?: any;  // legacy single field
};

function makeVersion(legacyAsset: any): SceneAssetVersion {
  return {
    version_id: randomUUID(),
    storage: legacyAsset.storage,
    prompt: legacyAsset.prompt ?? null,
    model: legacyAsset.model ?? null,
    generated_at: legacyAsset.generated_at,
    cost_usd: legacyAsset.cost_usd ?? null,
    has_native_audio: legacyAsset.has_native_audio,
    source: (legacyAsset.source === 'ai_text2img' || legacyAsset.source === 'ai_img2img_continuity')
      ? 'auto_continuity'
      : (legacyAsset.source === 'user_upload' ? 'user_upload' : 'manual_text2img'),
  };
}

export function upgradeScene(legacy: LegacyScene): Scene {
  const ffVersion = (legacy.first_frame && legacy.first_frame !== null) ? makeVersion(legacy.first_frame) : null;
  const vidVersion = (legacy.video && legacy.video !== null) ? makeVersion(legacy.video) : null;

  return {
    scene_id: legacy.scene_id,
    description: legacy.description,
    dialogue: legacy.dialogue ?? null,
    character_ids: legacy.character_ids ?? [],
    composition_hint: legacy.composition_hint,
    duration_sec: legacy.duration_sec,
    config_overrides: legacy.config_overrides,
    audio_mode: (legacy.audio_mode as any) ?? 'auto',
    first_frame_source: (legacy.first_frame_source as any) ?? 'auto_continuity',
    first_frame_versions: ffVersion ? [ffVersion] : [],
    first_frame_active_version_id: ffVersion?.version_id ?? null,
    video_versions: vidVersion ? [vidVersion] : [],
    video_active_version_id: vidVersion?.version_id ?? null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: legacy.last_frame ?? null,
    final_clip: legacy.final_clip ?? null,
  };
}

export function upgradeScript(legacy: LegacyScript): Script {
  const masterVersion: MasterClipVersion | null =
    legacy.master_clip
      ? {
          version_id: randomUUID(),
          storage: legacy.master_clip.storage,
          generated_at: legacy.master_clip.generated_at,
          cost_usd: legacy.master_clip.cost_usd ?? null,
          composed_from_scene_versions: (legacy.master_clip.scene_ids_snapshot ?? []).map((sid: string) => ({
            scene_id: sid, video_version_id: 'legacy', voice_audio_version_id: null,
          })),
        }
      : null;

  // Build new without master_clip key
  const upgraded: Script = {
    title: legacy.title,
    narrator_voice: legacy.narrator_voice,
    characters: legacy.characters,
    scenes: legacy.scenes.map(upgradeScene),
    master_clip_versions: masterVersion ? [masterVersion] : [],
    master_clip_active_version_id: masterVersion?.version_id ?? null,
  };
  return upgraded;
}

export function downgradeScript(script: Script): unknown {
  // Extract active versions back to single fields, drop versioned arrays.
  const downScenes = script.scenes.map((s) => {
    const ff = s.first_frame_active_version_id
      ? s.first_frame_versions.find((v) => v.version_id === s.first_frame_active_version_id) ?? null
      : null;
    const vid = s.video_active_version_id
      ? s.video_versions.find((v) => v.version_id === s.video_active_version_id) ?? null
      : null;
    return {
      scene_id: s.scene_id, description: s.description, dialogue: s.dialogue,
      character_ids: s.character_ids, composition_hint: s.composition_hint,
      duration_sec: s.duration_sec, config_overrides: s.config_overrides,
      audio_mode: s.audio_mode, first_frame_source: s.first_frame_source,
      first_frame: ff ? { storage: ff.storage, model: ff.model, generated_at: ff.generated_at, source: 'ai_text2img' } : null,
      video: vid ? { storage: vid.storage, model: vid.model, generated_at: vid.generated_at, has_native_audio: vid.has_native_audio ?? false, source: 'ai_img2vid', duration_sec: s.duration_sec } : null,
      last_frame: s.last_frame, final_clip: s.final_clip,
    };
  });
  const masterActive = script.master_clip_active_version_id
    ? script.master_clip_versions.find((v) => v.version_id === script.master_clip_active_version_id) ?? null
    : null;
  return {
    title: script.title,
    narrator_voice: script.narrator_voice,
    characters: script.characters,
    scenes: downScenes,
    master_clip: masterActive ? {
      storage: masterActive.storage, generated_at: masterActive.generated_at,
      scene_ids_snapshot: masterActive.composed_from_scene_versions.map((s) => s.scene_id),
    } : null,
  };
}
