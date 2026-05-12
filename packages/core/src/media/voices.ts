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
 * Indicative pool of ElevenLabs premade voices verified to support
 * Russian via the multilingual-v2 model. If the catalog changes,
 * verify with `GET /v1/voices?category=premade` and a TTS sandbox
 * test on a Russian sample before swapping ids.
 */
// voice_settings_default — narrator gets higher stability (0.6) for podcast-like consistency;
// young/expressive voices use lower stability (0.4) for emotional range. style=0 keeps native
// voice character (no amplification). speed 0.95 for soft/serious voices is a subtle slowdown.
export const VOICE_POOL: VoiceOption[] = [
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    label: 'Rachel',
    gender: 'female',
    tone: 'нейтральный',
    supports_ru: true,
    voice_settings_default: { stability: 0.6, similarity_boost: 0.75, style: 0, speed: 1.0 },
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    label: 'Adam',
    gender: 'male',
    tone: 'нейтральный',
    supports_ru: true,
    voice_settings_default: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1.0 },
  },
  {
    id: 'AZnzlk1XvdvUeBnXmlld',
    label: 'Domi',
    gender: 'female',
    tone: 'молодой',
    supports_ru: true,
    voice_settings_default: { stability: 0.4, similarity_boost: 0.7, style: 0, speed: 1.0 },
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    label: 'Bella',
    gender: 'female',
    tone: 'мягкий',
    supports_ru: true,
    voice_settings_default: { stability: 0.55, similarity_boost: 0.75, style: 0, speed: 0.95 },
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    label: 'Antoni',
    gender: 'male',
    tone: 'тёплый',
    supports_ru: true,
    voice_settings_default: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1.0 },
  },
  {
    id: 'VR6AewLTigWG4xSOukaG',
    label: 'Arnold',
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
