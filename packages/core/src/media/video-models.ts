import type { Tier } from './model-registry';

export interface VideoModelMeta {
  id: string;
  tier: Tier;
  has_native_audio: boolean;
  duration_options: readonly number[];
  aspect_ratios: readonly string[];
  cost_hint: 'low' | 'medium' | 'high';
  notes?: string;
}

const VIDEO_MODEL_LIST: readonly VideoModelMeta[] = [
  {
    id: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    tier: 'economy',
    has_native_audio: false,
    duration_options: [5, 10],
    aspect_ratios: ['16:9', '9:16', '1:1'],
    cost_hint: 'low',
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video',
    tier: 'economy',
    has_native_audio: false,
    duration_options: [5, 10],
    aspect_ratios: ['16:9', '9:16', '1:1'],
    cost_hint: 'low',
  },
  {
    id: 'fal-ai/ltx-video',
    tier: 'economy',
    has_native_audio: false,
    duration_options: [5, 8, 10],
    aspect_ratios: ['16:9', '9:16'],
    cost_hint: 'low',
    notes: 'Preview-tier — низкое качество, для быстрых черновиков',
  },
  {
    id: 'bytedance/seedance-2.0/image-to-video',
    tier: 'premium',
    has_native_audio: true,
    duration_options: [4, 5, 6, 7, 8, 9, 10, 12],
    aspect_ratios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
    cost_hint: 'high',
  },
  {
    id: 'fal-ai/veo3.1/image-to-video',
    tier: 'premium',
    has_native_audio: true,
    duration_options: [8],
    aspect_ratios: ['16:9', '9:16'],
    cost_hint: 'high',
    notes: 'Native audio approximates speech; для точной озвучки используй silent + TTS',
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    tier: 'premium',
    has_native_audio: false,
    duration_options: [5, 10],
    aspect_ratios: ['16:9', '9:16', '1:1'],
    cost_hint: 'medium',
  },
];

export const VIDEO_MODELS = {
  economy: {
    default: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    alternatives: ['fal-ai/kling-video/v2.5-turbo/standard/image-to-video', 'fal-ai/ltx-video'],
  },
  premium: {
    default: 'bytedance/seedance-2.0/image-to-video',
    alternatives: [
      'fal-ai/veo3.1/image-to-video',
      'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    ],
  },
} as const;

export const VOICE_MODELS = {
  economy: {
    default: 'fal-ai/elevenlabs/tts/multilingual-v2',
    alternatives: ['fal-ai/playai/tts', 'fal-ai/cartesia/voice/tts'],
  },
  premium: {
    default: 'fal-ai/elevenlabs/tts/multilingual-v2',
    alternatives: ['fal-ai/playai/tts', 'fal-ai/cartesia/voice/tts'],
  },
} as const;

export const MUX_MODEL = 'fal-ai/ffmpeg-api/merge-audio-video';
export const CONCAT_MODEL = 'fal-ai/ffmpeg-api/merge-videos';
export const EXTRACT_LAST_FRAME_MODEL = 'fal-ai/ffmpeg-api/extract-frame';

export function getDefaultVideoModel(tier: Tier): string {
  return VIDEO_MODELS[tier].default;
}

export function getActiveVideoModels(tier: Tier): readonly string[] {
  const set = VIDEO_MODELS[tier];
  return [set.default, ...set.alternatives];
}

export function getVideoModelMeta(model: string): VideoModelMeta | null {
  return VIDEO_MODEL_LIST.find((m) => m.id === model) ?? null;
}

export function isVideoModelInTier(model: string, tier: Tier): boolean {
  return getActiveVideoModels(tier).includes(model);
}

export function getDefaultVoiceModel(tier: Tier): string {
  return VOICE_MODELS[tier].default;
}

export function clampDurationToModel(model: string, requested: number): number {
  const meta = getVideoModelMeta(model);
  if (!meta) return requested;
  const opts = meta.duration_options;
  if (opts.includes(requested)) return requested;
  let best = opts[0]!;
  let bestDist = Math.abs(opts[0]! - requested);
  for (const o of opts) {
    const dist = Math.abs(o - requested);
    if (dist < bestDist || (dist === bestDist && o > best)) {
      best = o;
      bestDist = dist;
    }
  }
  return best;
}
