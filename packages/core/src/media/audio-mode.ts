import type { Character } from '../llm/types';
import { VOICE_POOL, type VoiceSettingsDefault } from './voices';

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
 *
 * ## Cyrillic → silent_tts is a deliberate quality tradeoff (F32)
 *
 * Seedance 2.0 Pro and Veo 3.1 advertise native audio, but their
 * speech-synthesis paths are trained almost exclusively on English. Native
 * audio for Russian dialogue regresses to phonetically-correct-but-tonally-wrong
 * output — wrong stress patterns, awkward vowel reductions, and audibly
 * "non-native" intonation. The Cyrillic short-circuit in this resolver
 * downgrades such scenes to silent_tts so that the post-prod TTS pass
 * (ElevenLabs multilingual-v2 + per-voice settings, see voices.ts) can
 * produce natural Russian audio that's later muxed onto the silent video.
 *
 * This is a quality choice, not a hard technical limitation. A future
 * `force_audio_mode` project setting (planned: post-1.4) will let Russian
 * projects opt into native audio for stylistic effect (e.g. a deliberately
 * accented narrator) or when the model's Russian quality improves.
 *
 * **Do not** "fix" the Cyrillic gate to allow native audio without first
 * verifying via the eval harness (1.4.H) that the model's Russian output
 * has crossed the natural-listener threshold.
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

/** Narrator voice shape extended with flat voice_settings fields. */
export type NarratorVoiceWithSettings = NarratorVoiceLike & {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
};

/** Character voice shape (subset used by resolveVoiceSettings). */
type CharacterVoiceForSettings = {
  tts_voice_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
};

/** Sensible narrator-default fallback when no pool entry matches. */
const NARRATOR_DEFAULT_SETTINGS: VoiceSettingsDefault = {
  stability: 0.6,
  similarity_boost: 0.75,
  style: 0,
  speed: 1.0,
};

/**
 * Resolves the ElevenLabs `voice_settings` object for a given speaker.
 *
 * Precedence chain:
 * 1. If `speaker` is a character AND that character's `voice` object has any of
 *    `stability | similarity_boost | style | speed` set → use those as override.
 * 2. If `speaker === 'narrator'` AND `narrator` has any of those fields set → use them.
 * 3. Resolve the effective `voice_id` via `resolveVoiceId` and look it up in
 *    `VOICE_POOL`. If found → return its `voice_settings_default`.
 * 4. Fall back to narrator-default: `{ stability:0.6, similarity_boost:0.75, style:0, speed:1.0 }`.
 *
 * This mirrors `resolveVoiceId` in signature to keep the call-site symmetric.
 */
export function resolveVoiceSettings(
  speaker: string,
  characters: ReadonlyArray<{
    id: string;
    voice_id?: string;
    voice?: CharacterVoiceForSettings;
  }>,
  narrator: NarratorVoiceWithSettings | null | undefined,
): VoiceSettingsDefault {
  if (speaker !== 'narrator') {
    const ch = characters.find((c) => c.id === speaker);
    const v = ch?.voice;
    if (
      v &&
      (v.stability !== undefined ||
        v.similarity_boost !== undefined ||
        v.style !== undefined ||
        v.speed !== undefined)
    ) {
      return {
        stability: v.stability ?? NARRATOR_DEFAULT_SETTINGS.stability,
        similarity_boost: v.similarity_boost ?? NARRATOR_DEFAULT_SETTINGS.similarity_boost,
        style: v.style ?? NARRATOR_DEFAULT_SETTINGS.style,
        speed: v.speed ?? NARRATOR_DEFAULT_SETTINGS.speed,
      };
    }
  } else {
    // narrator branch
    const n = narrator as (NarratorVoiceWithSettings & { stability?: number }) | null | undefined;
    if (
      n &&
      (n.stability !== undefined ||
        n.similarity_boost !== undefined ||
        n.style !== undefined ||
        n.speed !== undefined)
    ) {
      return {
        stability: n.stability ?? NARRATOR_DEFAULT_SETTINGS.stability,
        similarity_boost: n.similarity_boost ?? NARRATOR_DEFAULT_SETTINGS.similarity_boost,
        style: n.style ?? NARRATOR_DEFAULT_SETTINGS.style,
        speed: n.speed ?? NARRATOR_DEFAULT_SETTINGS.speed,
      };
    }
  }

  // Look up in VOICE_POOL using the resolved voice_id
  // Re-use resolveVoiceId internally (pass characters cast to Character[])
  const voiceId = resolveVoiceId(speaker, characters as Character[], narrator);
  const poolEntry = VOICE_POOL.find((v) => v.id === voiceId);
  if (poolEntry) return poolEntry.voice_settings_default;

  return NARRATOR_DEFAULT_SETTINGS;
}
