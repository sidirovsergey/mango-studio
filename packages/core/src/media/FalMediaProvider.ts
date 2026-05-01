// packages/core/src/media/FalMediaProvider.ts
import { fal } from '@fal-ai/client';
import { MediaProviderError, classifyMediaError } from './errors';
import { getEditModel } from './model-registry';
import type {
  AssetContext,
  DossierFormat,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  MediaProvider,
} from './provider';

export interface FalMediaProviderOptions {
  apiKey: string;
  resolveImageUrl?: (
    refUrl: { kind: 'fal_passthrough'; url: string } | { kind: 'supabase'; path: string },
  ) => Promise<string>;
  timeoutMs?: number;
}

/**
 * Per-model aspect-ratio formatting. nano-banana family expects literal ratio
 * strings ('16:9', '1:1'). flux family expects size identifiers
 * ('landscape_16_9', 'square_hd'). When adding new models, extend this map.
 * Default (nano-banana style) used for unknown models.
 */
function formatAspectFor(model: string, format: DossierFormat): string {
  if (model.includes('flux') || model.includes('recraft') || model.includes('seedream')) {
    return format === '16:9' ? 'landscape_16_9' : 'square_hd';
  }
  // nano-banana, default
  return format;
}

export class FalMediaProvider implements MediaProvider {
  private timeoutMs: number;

  constructor(private opts: FalMediaProviderOptions) {
    fal.config({ credentials: opts.apiKey });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async generateCharacterDossier(
    input: GenerateCharacterDossierInput,
    _ctx: AssetContext,
  ): Promise<GenerateCharacterDossierResult> {
    const useEdit = (input.image_refs?.length ?? 0) > 0;

    let modelToUse = input.model;
    let firstImageUrl: string | undefined;

    if (useEdit) {
      if (!this.opts.resolveImageUrl) {
        throw new MediaProviderError(
          'invalid_input',
          'image_refs provided but resolveImageUrl not configured',
        );
      }
      const editModel = getEditModel(input.model);
      if (!editModel) {
        throw new MediaProviderError(
          'invalid_input',
          `Model ${input.model} doesn't support image-to-image`,
        );
      }
      modelToUse = editModel;
      const firstRef = input.image_refs![0];
      if (firstRef) {
        firstImageUrl = await this.opts.resolveImageUrl(firstRef);
      }
    }

    // nano-banana edit endpoint expects image_urls (array). Other edit
    // models (flux/kontext, seedream/edit) also use image_urls. Send singular
    // image_url only as a defensive fallback for legacy schemas.
    const editPayload =
      useEdit && firstImageUrl ? { image_urls: [firstImageUrl], image_url: firstImageUrl } : {};

    const requestInput = {
      prompt: input.prompt,
      ...editPayload,
      aspect_ratio: formatAspectFor(modelToUse, input.format),
    };

    const startedAt = Date.now();
    try {
      const resp = await fal.subscribe(modelToUse, { input: requestInput, logs: false });

      const latency_ms = Date.now() - startedAt;
      const data = (resp as { data?: { images?: Array<{ url: string }> } }).data;
      const url = data?.images?.[0]?.url;
      if (!url) {
        throw new MediaProviderError('unknown', 'fal response missing images[0].url');
      }

      return {
        fal_url: url,
        cost_usd: null,
        latency_ms,
        fal_request_id: (resp as { requestId?: string }).requestId ?? '',
        model_used: modelToUse,
      };
    } catch (raw) {
      if (raw instanceof MediaProviderError) throw raw;
      const code = classifyMediaError(raw);
      const status = (raw as { status?: number })?.status;
      const message = (raw as { message?: string })?.message;
      const body = (raw as { body?: unknown })?.body;
      // Surface fal's actual response so we can diagnose 422 / 4xx classes.
      console.error(
        '[FalMediaProvider]',
        modelToUse,
        'failed',
        JSON.stringify({ status, message, body, requestInputKeys: Object.keys(requestInput) }),
      );
      const detail =
        body && typeof body === 'object' && 'detail' in body
          ? JSON.stringify((body as { detail: unknown }).detail).slice(0, 200)
          : (message ?? 'fal call failed');
      throw new MediaProviderError(code, detail);
    }
  }
}
