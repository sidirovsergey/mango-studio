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
  // ── Active (native-audio only after 2026-05-13 simplification) ────────────
  // Economy default. Grok Imagine Video — native audio + lipsync, strong Russian.
  // 480p $0.05/s + $0.002 image input. Single economy choice by design.
  {
    id: 'xai/grok-imagine-video/image-to-video',
    tier: 'economy',
    has_native_audio: true,
    duration_options: [5, 10],
    aspect_ratios: ['9:16', '16:9', '1:1'],
    cost_hint: 'medium',
    notes: 'Grok Imagine Video — native audio w/ Russian lipsync, 480p default',
  },
  // Premium default. Seedance 2.0 Pro — flexible 4–12s, cinema look.
  {
    id: 'bytedance/seedance-2.0/image-to-video',
    tier: 'premium',
    has_native_audio: true,
    duration_options: [4, 5, 6, 7, 8, 9, 10, 12],
    aspect_ratios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
    cost_hint: 'high',
  },
  // Premium alt. Veo 3.1 — Google flagship, fixed 8s, strong physics + audio.
  {
    id: 'fal-ai/veo3.1/image-to-video',
    tier: 'premium',
    has_native_audio: true,
    duration_options: [8],
    aspect_ratios: ['16:9', '9:16'],
    cost_hint: 'high',
  },

  // ── Legacy (kept for back-compat parsing of pre-simplification projects) ──
  // These were active before 2026-05-13 but did NOT support native audio. They
  // power historic media_jobs rows + scenes that picked them via Director
  // tool. Absent from VIDEO_MODELS.{economy,premium} so new selectors don't
  // expose them. getVideoModelMeta() still returns metadata for cost-hint
  // surfacing on old scene cards.
  {
    id: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    tier: 'economy',
    has_native_audio: false,
    duration_options: [5, 10],
    aspect_ratios: ['16:9', '9:16', '1:1'],
    cost_hint: 'low',
    notes: 'LEGACY — replaced by Grok Imagine Video in economy',
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video',
    tier: 'economy',
    has_native_audio: false,
    duration_options: [5, 10],
    aspect_ratios: ['16:9', '9:16', '1:1'],
    cost_hint: 'low',
    notes: 'LEGACY — no native audio, demoted',
  },
  {
    id: 'fal-ai/ltx-video',
    tier: 'economy',
    has_native_audio: false,
    duration_options: [5, 8, 10],
    aspect_ratios: ['16:9', '9:16'],
    cost_hint: 'low',
    notes: 'LEGACY — preview-tier, no native audio, demoted',
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    tier: 'premium',
    has_native_audio: false,
    duration_options: [5, 10],
    aspect_ratios: ['16:9', '9:16', '1:1'],
    cost_hint: 'medium',
    notes: 'LEGACY — no native audio, demoted',
  },
];

// Active model sets — only native-audio engines after 2026-05-13.
//
// Economy default swapped from Grok to Seedance 2.0 on 2026-05-26 after the
// e942fd19 production incident. xAI Grok via fal-partner had a 24% success
// rate over 21 prod video jobs (5 completed / 16 stuck IN_QUEUE forever).
// Pattern looked like fal accepting a submit + returning fal_request_id but
// xAI processing only ~1 concurrent job per session — successive submits
// queued forever. Seedance 2.0 has native audio AND demonstrated reliability
// from its premium-tier production track record. Grok stays available as an
// economy alternative for users who want to retry it; PR-A's stale-detection
// now snaps stuck Grok jobs to error after 10 min instead of hanging the UI
// forever, so the alternative is safe to expose.
export const VIDEO_MODELS = {
  economy: {
    default: 'bytedance/seedance-2.0/image-to-video',
    alternatives: ['xai/grok-imagine-video/image-to-video'] as readonly string[],
  },
  premium: {
    default: 'bytedance/seedance-2.0/image-to-video',
    alternatives: ['fal-ai/veo3.1/image-to-video', 'xai/grok-imagine-video/image-to-video'],
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
