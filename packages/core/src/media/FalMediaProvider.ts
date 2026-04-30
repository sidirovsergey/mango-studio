// packages/core/src/media/FalMediaProvider.ts
import { fal } from '@fal-ai/client'
import type {
  MediaProvider,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  AssetContext,
} from './provider'
import { MediaProviderError, classifyMediaError } from './errors'
import { getEditModel } from './model-registry'

export interface FalMediaProviderOptions {
  apiKey: string
  resolveImageUrl?: (refUrl: { kind: 'fal_passthrough'; url: string } | { kind: 'supabase'; path: string }) => Promise<string>
  timeoutMs?: number
}

export class FalMediaProvider implements MediaProvider {
  private timeoutMs: number

  constructor(private opts: FalMediaProviderOptions) {
    fal.config({ credentials: opts.apiKey })
    this.timeoutMs = opts.timeoutMs ?? 120_000
  }

  async generateCharacterDossier(
    input: GenerateCharacterDossierInput,
    _ctx: AssetContext
  ): Promise<GenerateCharacterDossierResult> {
    const useEdit = (input.image_refs?.length ?? 0) > 0

    let modelToUse = input.model
    let firstImageUrl: string | undefined

    if (useEdit) {
      if (!this.opts.resolveImageUrl) {
        throw new MediaProviderError('invalid_input', 'image_refs provided but resolveImageUrl not configured')
      }
      const editModel = getEditModel(input.model)
      if (!editModel) {
        throw new MediaProviderError('invalid_input', `Model ${input.model} doesn't support image-to-image`)
      }
      modelToUse = editModel
      const firstRef = input.image_refs![0]
      if (firstRef) {
        firstImageUrl = await this.opts.resolveImageUrl(firstRef)
      }
    }

    const startedAt = Date.now()
    try {
      const resp = await fal.subscribe(modelToUse, {
        input: {
          prompt: input.prompt,
          ...(firstImageUrl ? { image_url: firstImageUrl } : {}),
          aspect_ratio: input.format,
        },
        logs: false,
      })

      const latency_ms = Date.now() - startedAt
      const data = (resp as { data?: { images?: Array<{ url: string }> } }).data
      const url = data?.images?.[0]?.url
      if (!url) {
        throw new MediaProviderError('unknown', 'fal response missing images[0].url')
      }

      return {
        fal_url: url,
        cost_usd: null,
        latency_ms,
        fal_request_id: (resp as { requestId?: string }).requestId ?? '',
        model_used: modelToUse,
      }
    } catch (raw) {
      if (raw instanceof MediaProviderError) throw raw
      const code = classifyMediaError(raw)
      const msg = (raw as { message?: string })?.message ?? 'fal call failed'
      throw new MediaProviderError(code, msg)
    }
  }
}
