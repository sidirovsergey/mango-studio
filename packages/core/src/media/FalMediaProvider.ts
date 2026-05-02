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
    return this.submit(input.model, {
      prompt: input.prompt,
      image_url: ref_url,
      duration: input.duration_sec,
      aspect_ratio: input.aspect_ratio,
    });
  }

  async submitVoice(input: GenerateVoiceInput, _ctx: AssetContext): Promise<JobHandle> {
    return this.submit(input.tts_provider_model, {
      text: input.text,
      voice: input.voice_id,
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
      const pricing = (resp as { pricing?: { total_cost_usd?: number } }).pricing;

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

      return {
        primary_url,
        last_frame_url: (data.last_frame_url as string | undefined) ?? undefined,
        cost_usd: pricing?.total_cost_usd ?? null,
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
