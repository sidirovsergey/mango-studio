import 'server-only';
import { MockMediaProvider } from './mock-provider';
import type { MediaProvider } from './provider';

export type {
  MediaProvider,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  DossierFormat,
  DossierQuality,
  AssetContext,
} from './provider';

export { MockMediaProvider } from './mock-provider';

export type { StoredAsset, StorageProvider } from './storage/StorageProvider';

export {
  ECONOMY_MODELS,
  PREMIUM_MODELS,
  getDefaultModel,
  getActiveModels,
  getEditModel,
  isModelInTier,
} from './model-registry';
export type { Tier } from './model-registry';

export { buildDossierPrompt } from './prompts';

export { MediaProviderError, classifyMediaError } from './errors';
export type { MediaErrorCode } from './errors';

export function getMediaProvider(): MediaProvider {
  // Phase 0/1.1: только Mock
  // Phase 1.2+: switch по env MEDIA_PROVIDER === 'fal'
  return new MockMediaProvider();
}
