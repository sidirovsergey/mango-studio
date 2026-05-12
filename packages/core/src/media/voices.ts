export type VoiceSettingsDefault = {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
};

export type VoiceOption = {
  id: string;
  label: string;
  gender: 'male' | 'female' | 'other';
  tone: string;
  supports_ru: boolean;
  voice_settings_default: VoiceSettingsDefault;
};

/**
 * ElevenLabs premade voices verified against the production catalog on 2026-05-12 (F29
 * verification pass). 4 of the original 6 IDs were MISSING (404) and replaced with live catalog
 * equivalents; 2 IDs were kept but renamed in ElevenLabs (Adam → "Adam - Dominant, Firm",
 * Bella → "Sarah - Mature, Reassuring, Confident"). All 6 entries confirmed reachable via
 * `GET /v1/voices/:id` on the production ElevenLabs API. Russian support is guaranteed at
 * model level (fal-ai/elevenlabs/tts/multilingual-v2 → eleven_multilingual_v2).
 *
 * Slot roles (position-bound — do NOT reorder; voice_settings_default is role-bound):
 *   [0] Janet  — narrator default (MANGO_DEFAULT_NARRATOR_VOICE_ID targets this slot when unset)
 *   [1] Adam   — male confident
 *   [2] Jessica — female young
 *   [3] Sarah  — female soft
 *   [4] George — male warm
 *   [5] Daniel — male serious
 */
// voice_settings_default — narrator gets higher stability (0.6) for podcast-like consistency;
// Adam (уверенный) and George/Daniel use 0.5/0.55 for controlled firmness / broadcast clarity;
// young/expressive voices (Jessica) use lower stability (0.4) for emotional range. style=0 keeps
// native voice character (no amplification). speed 0.95 for soft/serious voices is a subtle
// slowdown.
export const VOICE_POOL: VoiceOption[] = [
  {
    id: 'eLDc7xhWxG2FElT3kUTj', // was: 21m00Tcm4TlvDq8ikWAM Rachel (MISSING in catalog F29)
    label: 'Janet',
    gender: 'female',
    tone: 'нейтральный',
    supports_ru: true,
    voice_settings_default: { stability: 0.6, similarity_boost: 0.75, style: 0, speed: 1.0 },
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB', // KEEP — live name "Adam - Dominant, Firm"; strip descriptor for Mango
    label: 'Adam',
    gender: 'male',
    tone: 'уверенный', // was 'нейтральный'; ElevenLabs catalog says "Dominant, Firm"
    supports_ru: true,
    voice_settings_default: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1.0 },
  },
  {
    id: 'cgSgspJ2msm6clMCkdW9', // was: AZnzlk1XvdvUeBnXmlld Domi (MISSING in catalog F29)
    label: 'Jessica',
    gender: 'female',
    tone: 'молодой',
    supports_ru: true,
    voice_settings_default: { stability: 0.4, similarity_boost: 0.7, style: 0, speed: 1.0 },
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL', // KEEP — live name "Sarah - Mature, Reassuring, Confident"; strip descriptor
    label: 'Sarah',
    gender: 'female',
    tone: 'мягкий', // 'reassuring' loosely maps to soft; slot semantic preserved
    supports_ru: true,
    voice_settings_default: { stability: 0.55, similarity_boost: 0.75, style: 0, speed: 0.95 },
  },
  {
    id: 'JBFqnCBsd6RMkjVDRZzb', // was: ErXwobaYiN019PkySvjV Antoni (MISSING in catalog F29)
    label: 'George',
    gender: 'male',
    tone: 'тёплый',
    supports_ru: true,
    voice_settings_default: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1.0 },
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9', // was: VR6AewLTigWG4xSOukaG Arnold (MISSING in catalog F29)
    label: 'Daniel',
    gender: 'male',
    tone: 'серьёзный',
    supports_ru: true,
    voice_settings_default: { stability: 0.55, similarity_boost: 0.75, style: 0, speed: 0.95 },
  },
];

export function getVoiceById(id: string): VoiceOption | undefined {
  return VOICE_POOL.find((v) => v.id === id);
}

export const DEFAULT_NARRATOR_VOICE_ID =
  process.env.MANGO_DEFAULT_NARRATOR_VOICE_ID ?? VOICE_POOL[0]!.id;
