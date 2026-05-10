export type VoiceOption = {
  id: string;
  label: string;
  gender: 'male' | 'female' | 'other';
  tone: string;
  supports_ru: boolean;
};

/**
 * Indicative pool of ElevenLabs premade voices verified to support
 * Russian via the multilingual-v2 model. If the catalog changes,
 * verify with `GET /v1/voices?category=premade` and a TTS sandbox
 * test on a Russian sample before swapping ids.
 */
export const VOICE_POOL: VoiceOption[] = [
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    label: 'Rachel',
    gender: 'female',
    tone: 'нейтральный',
    supports_ru: true,
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    label: 'Adam',
    gender: 'male',
    tone: 'нейтральный',
    supports_ru: true,
  },
  {
    id: 'AZnzlk1XvdvUeBnXmlld',
    label: 'Domi',
    gender: 'female',
    tone: 'молодой',
    supports_ru: true,
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    label: 'Bella',
    gender: 'female',
    tone: 'мягкий',
    supports_ru: true,
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    label: 'Antoni',
    gender: 'male',
    tone: 'тёплый',
    supports_ru: true,
  },
  {
    id: 'VR6AewLTigWG4xSOukaG',
    label: 'Arnold',
    gender: 'male',
    tone: 'серьёзный',
    supports_ru: true,
  },
];

export function getVoiceById(id: string): VoiceOption | undefined {
  return VOICE_POOL.find((v) => v.id === id);
}

export const DEFAULT_NARRATOR_VOICE_ID =
  process.env.MANGO_DEFAULT_NARRATOR_VOICE_ID ?? VOICE_POOL[0]!.id;
