import type { Character } from '../llm/types';
import { VOICE_POOL } from './voices';

const CYRILLIC_RE = /[Ѐ-ӿ]/;

export type SceneForAudio = {
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  dialogue: { speaker: 'narrator' | string; text: string } | null;
};

export type VideoModelMetaForAudio = { has_native_audio: boolean };

/**
 * Resolves the effective audio mode for a scene, combining the explicit
 * scene-level setting with auto-detection (Cyrillic dialogue forces silent_tts;
 * Latin dialogue picks native iff the model supports it; otherwise silent_tts).
 */
export function resolveAudioMode(
  scene: SceneForAudio,
  model: VideoModelMetaForAudio,
): 'native' | 'silent_tts' {
  if (scene.audio_mode === 'native') return 'native';
  if (scene.audio_mode === 'silent_tts') return 'silent_tts';

  // 'auto' branch (default)
  const text = scene.dialogue?.text ?? '';
  if (CYRILLIC_RE.test(text)) return 'silent_tts';
  if (model.has_native_audio) return 'native';
  return 'silent_tts';
}

/**
 * Narrator voice can come in two shapes in the codebase:
 *  - `{ voice_id, voice_label }` (legacy / character-style)
 *  - `{ tts_voice_id, description? }` (current schema NarratorVoiceSchema)
 *
 * The resolver accepts either to keep callers shim-free.
 */
export type NarratorVoiceLike =
  | { voice_id: string; voice_label?: string }
  | { tts_voice_id: string; description?: string }
  | undefined
  | null;

function narratorVoiceId(narrator: NarratorVoiceLike): string | null {
  if (!narrator) return null;
  if ('voice_id' in narrator && typeof narrator.voice_id === 'string') {
    return narrator.voice_id;
  }
  if ('tts_voice_id' in narrator && typeof narrator.tts_voice_id === 'string') {
    return narrator.tts_voice_id;
  }
  return null;
}

/**
 * Resolves the ElevenLabs voice_id to use for a given speaker.
 * - 'narrator' → narrator voice (either shape).
 * - character_id → that character's `voice_id` if set.
 * - falls back to VOICE_POOL[0].id for unknown speakers / missing voice fields.
 */
export function resolveVoiceId(
  speaker: 'narrator' | string,
  characters: Character[],
  narrator: NarratorVoiceLike,
): string {
  if (speaker === 'narrator') {
    return narratorVoiceId(narrator) ?? VOICE_POOL[0]!.id;
  }
  const ch = characters.find((c) => c.id === speaker);
  if (ch?.voice_id) return ch.voice_id;
  return VOICE_POOL[0]!.id;
}
