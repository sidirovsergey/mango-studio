import { fal } from '@fal-ai/client';
import { MediaProviderError, classifyMediaError } from './errors';
import { getEditModel } from './model-registry';
import type {
  AssetContext,
  ComposeFinalClipInput,
  ConcatMasterInput,
  DossierFormat,
  ExtractLastFrameInput,
  GenerateCharacterDossierInput,
  GenerateCharacterReferenceImageInput,
  GenerateFirstFrameInput,
  GenerateSceneVideoInput,
  GenerateVoiceInput,
  JobHandle,
  JobResult,
  JobStatus,
  MediaProvider,
} from './provider';
import type { StoredAsset } from './storage/StorageProvider';
import { CONCAT_MODEL, EXTRACT_LAST_FRAME_MODEL, MUX_MODEL } from './video-models';

export interface FalMediaProviderOptions {
  apiKey: string;
  resolveImageUrl?: (asset: StoredAsset) => Promise<string>;
}

function formatAspectFor(model: string, format: DossierFormat | '9:16'): string {
  if (model.includes('flux') || model.includes('recraft') || model.includes('seedream')) {
    if (format === '16:9') return 'landscape_16_9';
    if (format === '9:16') return 'portrait_16_9';
    return 'square_hd';
  }
  return format;
}

/**
 * Approximate cost per call for models fal does not return pricing for.
 * Fallback so the cost meter is order-of-magnitude correct rather than $0
 * when fal omits `pricing` from queue.result.
 */
const MODEL_COST_FALLBACK_USD: Record<string, number> = {
  'fal-ai/nano-banana': 0.02,
  'fal-ai/nano-banana-2': 0.02,
  'fal-ai/nano-banana-2/edit': 0.02,
  'fal-ai/nano-banana-pro': 0.06,
  'fal-ai/nano-banana-pro/edit': 0.06,
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': 0.18,
  'fal-ai/bytedance/seedance-2.0/image-to-video': 0.4,
  'fal-ai/veo3.1/image-to-video': 0.5,
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 0.35,
  // Grok Imagine Video — 480p $0.05/s + $0.002 image input; 720p $0.07/s + $0.002.
  // 10s × 480p ≈ $0.50, 10s × 720p ≈ $0.70. Mid-range cost-wise.
  'xai/grok-imagine-video/image-to-video': 0.5,
  'fal-ai/ffmpeg-api/extract-frame': 0.001,
  'fal-ai/ffmpeg-api/merge-videos': 0.002,
  'fal-ai/ffmpeg-api/merge-audio-video': 0.002,
  'fal-ai/elevenlabs/tts/multilingual-v2': 0.03,
};

function estimateCostUsd(model: string): number | null {
  if (MODEL_COST_FALLBACK_USD[model] !== undefined) return MODEL_COST_FALLBACK_USD[model];
  if (model.includes('image-to-video') || model.includes('video')) return 0.25;
  if (model.includes('image') || model.includes('banana')) return 0.02;
  if (model.includes('ffmpeg')) return 0.002;
  if (model.includes('elevenlabs') || model.includes('tts')) return 0.03;
  return null;
}

/**
 * fal returns pricing in multiple shapes depending on model + API surface.
 * Try every known path. Returns null if none match — caller can apply estimate.
 */
function extractCostUsd(resp: unknown): number | null {
  if (!resp || typeof resp !== 'object') return null;
  const r = resp as Record<string, unknown>;
  const topPricing = r.pricing as { total_cost_usd?: unknown; cost_usd?: unknown } | undefined;
  if (typeof topPricing?.total_cost_usd === 'number') return topPricing.total_cost_usd;
  if (typeof topPricing?.cost_usd === 'number') return topPricing.cost_usd;
  const data = r.data as Record<string, unknown> | undefined;
  const dataPricing = data?.pricing as { total_cost_usd?: unknown; cost_usd?: unknown } | undefined;
  if (typeof dataPricing?.total_cost_usd === 'number') return dataPricing.total_cost_usd;
  if (typeof dataPricing?.cost_usd === 'number') return dataPricing.cost_usd;
  const metrics = r.metrics as { cost_usd?: unknown; total_cost_usd?: unknown } | undefined;
  if (typeof metrics?.cost_usd === 'number') return metrics.cost_usd;
  if (typeof metrics?.total_cost_usd === 'number') return metrics.total_cost_usd;
  if (typeof r.cost_usd === 'number') return r.cost_usd as number;
  const billing = r.billing as { amount_usd?: unknown } | undefined;
  if (typeof billing?.amount_usd === 'number') return billing.amount_usd;
  return null;
}

export class FalMediaProvider implements MediaProvider {
  constructor(private opts: FalMediaProviderOptions) {
    fal.config({ credentials: opts.apiKey });
  }

  private async resolveRefs(refs: StoredAsset[] | undefined): Promise<string[]> {
    if (!refs || refs.length === 0) return [];
    if (!this.opts.resolveImageUrl) {
      throw new MediaProviderError(
        'invalid_input',
        'image_refs provided but resolveImageUrl not configured',
      );
    }
    const resolver = this.opts.resolveImageUrl;
    return Promise.all(refs.map((r) => resolver(r)));
  }

  private async submit<I extends Record<string, unknown>>(
    model: string,
    input: I,
  ): Promise<JobHandle> {
    try {
      const resp = await fal.queue.submit(model, { input });
      const request_id = (resp as { request_id?: string }).request_id;
      if (!request_id) {
        throw new MediaProviderError('unknown', 'fal.queue.submit returned no request_id');
      }
      return { fal_request_id: request_id, model_used: model, request_input: input };
    } catch (raw) {
      if (raw instanceof MediaProviderError) throw raw;
      throw new MediaProviderError(classifyMediaError(raw), String((raw as Error)?.message ?? raw));
    }
  }

  async submitCharacterDossier(
    input: GenerateCharacterDossierInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    let model = input.model;
    let editPayload: Record<string, unknown> = {};
    if (input.image_refs && input.image_refs.length > 0) {
      const editModel = getEditModel(input.model);
      if (!editModel) {
        throw new MediaProviderError(
          'invalid_input',
          `Model ${input.model} doesn't support image-to-image`,
        );
      }
      model = editModel;
      const urls = await this.resolveRefs(input.image_refs);
      editPayload = { image_urls: urls, image_url: urls[0] };
    }
    return this.submit(model, {
      prompt: input.prompt,
      ...editPayload,
      aspect_ratio: formatAspectFor(model, input.format),
    });
  }

  async submitCharacterReferenceImage(
    input: GenerateCharacterReferenceImageInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    // Image-to-image when refs provided — same routing as submitFirstFrame so
    // the reference_image is visually anchored to the dossier instead of
    // being an independent text-to-image roll.
    let model = input.model;
    let editPayload: Record<string, unknown> = {};
    if (input.image_refs && input.image_refs.length > 0) {
      const editModel = getEditModel(input.model);
      if (!editModel) {
        throw new MediaProviderError(
          'invalid_input',
          `Model ${input.model} doesn't support image-to-image for reference_image`,
        );
      }
      if (!this.opts.resolveImageUrl) {
        throw new MediaProviderError(
          'invalid_input',
          'resolveImageUrl required for image-to-image reference_image',
        );
      }
      model = editModel;
      const urls = await this.resolveRefs(input.image_refs);
      editPayload = { image_urls: urls, image_url: urls[0] };
    }
    return this.submit(model, {
      prompt: input.prompt,
      ...editPayload,
      aspect_ratio: formatAspectFor(model, '1:1'),
    });
  }

  async submitFirstFrame(input: GenerateFirstFrameInput, _ctx: AssetContext): Promise<JobHandle> {
    let model = input.model;
    let editPayload: Record<string, unknown> = {};
    if (input.image_refs && input.image_refs.length > 0) {
      const editModel = getEditModel(input.model);
      if (!editModel) {
        throw new MediaProviderError(
          'invalid_input',
          `Model ${input.model} doesn't support image-to-image`,
        );
      }
      model = editModel;
      const urls = await this.resolveRefs(input.image_refs);
      editPayload = { image_urls: urls, image_url: urls[0] };
    }
    return this.submit(model, {
      prompt: input.prompt,
      ...editPayload,
      aspect_ratio: formatAspectFor(model, '9:16'),
    });
  }

  async submitSceneVideo(input: GenerateSceneVideoInput, _ctx: AssetContext): Promise<JobHandle> {
    if (!this.opts.resolveImageUrl) {
      throw new MediaProviderError('invalid_input', 'resolveImageUrl required for video');
    }
    const ref_url = await this.opts.resolveImageUrl(input.first_frame_ref);

    // Grok Imagine Video takes an explicit `resolution` enum (480p / 720p);
    // omit for engines that don't recognise the field. Default 480p when
    // caller doesn't specify — keeps economy cost predictable.
    const isGrok = input.model.startsWith('xai/grok-imagine-video');
    const extra: Record<string, unknown> = {};
    if (isGrok) {
      extra.resolution = input.resolution ?? '480p';
    }

    return this.submit(input.model, {
      prompt: input.prompt,
      image_url: ref_url,
      duration: input.duration_sec,
      aspect_ratio: input.aspect_ratio,
      ...extra,
    });
  }

  async submitVoice(input: GenerateVoiceInput, _ctx: AssetContext): Promise<JobHandle> {
    return this.submit(input.tts_provider_model, {
      text: input.text,
      voice: input.voice_id,
      ...(input.voice_settings ? { voice_settings: input.voice_settings } : {}),
    });
  }

  async submitFinalClipMux(input: ComposeFinalClipInput, _ctx: AssetContext): Promise<JobHandle> {
    return this.submit(MUX_MODEL, {
      video_url: input.video_url,
      audio_url: input.audio_url,
    });
  }

  async submitMasterConcat(input: ConcatMasterInput, _ctx: AssetContext): Promise<JobHandle> {
    return this.submit(CONCAT_MODEL, {
      video_urls: input.clip_urls,
    });
  }

  async submitLastFrameExtract(
    input: ExtractLastFrameInput,
    _ctx: AssetContext,
  ): Promise<JobHandle> {
    return this.submit(EXTRACT_LAST_FRAME_MODEL, {
      video_url: input.video_url,
      mode: 'last',
    });
  }

  async getJobStatus(
    fal_request_id: string,
    model: string,
  ): Promise<{ status: JobStatus; error_code?: string }> {
    try {
      const resp = await fal.queue.status(model, { requestId: fal_request_id });
      const raw = (resp as { status?: string }).status ?? '';
      if (raw === 'IN_QUEUE') return { status: 'pending' };
      if (raw === 'IN_PROGRESS') return { status: 'running' };
      if (raw === 'COMPLETED') return { status: 'completed' };
      if (raw === 'FAILED') return { status: 'error', error_code: 'fal_failed' };
      return { status: 'pending' };
    } catch (raw) {
      throw new MediaProviderError(classifyMediaError(raw), String((raw as Error)?.message ?? raw));
    }
  }

  async getJobResult(fal_request_id: string, model: string): Promise<JobResult> {
    try {
      const resp = await fal.queue.result(model, { requestId: fal_request_id });
      const data = (resp as { data?: Record<string, unknown> }).data ?? {};

      const primary_url =
        (data.images as Array<{ url: string }> | undefined)?.[0]?.url ??
        (data.image as { url?: string } | undefined)?.url ??
        (data.video as { url?: string } | undefined)?.url ??
        (data.audio as { url?: string } | undefined)?.url ??
        (data.audio_url as string | undefined) ??
        (data.url as string | undefined) ??
        '';

      if (!primary_url) {
        throw new MediaProviderError(
          'unknown',
          `fal result missing primary url; data keys = ${Object.keys(data).join(',')}`,
        );
      }

      const extracted = extractCostUsd(resp);
      const cost_usd = extracted ?? estimateCostUsd(model);
      if (extracted === null) {
        console.warn(
          `[fal] no cost_usd in result for model=${model} request_id=${fal_request_id}; ` +
            `using estimate=${cost_usd}; ` +
            `top-keys=${Object.keys((resp as object) ?? {}).join(',')}; ` +
            `data-keys=${Object.keys(data).join(',')}`,
        );
      }

      return {
        primary_url,
        last_frame_url: (data.last_frame_url as string | undefined) ?? undefined,
        cost_usd,
        latency_ms: 0,
      };
    } catch (raw) {
      if (raw instanceof MediaProviderError) throw raw;
      throw new MediaProviderError(classifyMediaError(raw), String((raw as Error)?.message ?? raw));
    }
  }

  async cancelJob(fal_request_id: string, model: string): Promise<void> {
    try {
      await fal.queue.cancel(model, { requestId: fal_request_id });
    } catch (raw) {
      throw new MediaProviderError(classifyMediaError(raw), String((raw as Error)?.message ?? raw));
    }
  }
}
