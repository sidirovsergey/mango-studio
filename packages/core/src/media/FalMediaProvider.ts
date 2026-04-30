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
    throw new Error('Not implemented yet — Task 9')
  }
}
