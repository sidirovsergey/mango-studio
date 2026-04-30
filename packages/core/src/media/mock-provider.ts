import type {
  MediaProvider,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  AssetContext,
} from './provider'

export class MockMediaProvider implements MediaProvider {
  async generateCharacterDossier(
    input: GenerateCharacterDossierInput,
    _ctx: AssetContext
  ): Promise<GenerateCharacterDossierResult> {
    return {
      fal_url: `https://example.test/mock-dossier/${input.model}.png`,
      cost_usd: 0,
      latency_ms: 1,
      fal_request_id: 'mock-request',
      model_used: input.model,
    }
  }
}
