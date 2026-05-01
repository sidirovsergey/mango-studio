import type { AssetContext, StoredAsset } from './storage/StorageProvider';
export type { AssetContext } from './storage/StorageProvider';

export type DossierFormat = '16:9' | '1:1';
export type DossierQuality = '720p' | '1080p' | '2k';

export interface GenerateCharacterDossierInput {
  prompt: string;
  model: string;
  format: DossierFormat;
  quality: DossierQuality;
  image_refs?: StoredAsset[];
}

export interface GenerateCharacterDossierResult {
  fal_url: string;
  cost_usd: number | null;
  latency_ms: number;
  fal_request_id: string;
  model_used: string;
}

export interface MediaProvider {
  generateCharacterDossier(
    input: GenerateCharacterDossierInput,
    ctx: AssetContext,
  ): Promise<GenerateCharacterDossierResult>;
}
