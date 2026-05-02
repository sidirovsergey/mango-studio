export type {
  MediaProvider,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  DossierFormat,
  DossierQuality,
  AssetContext,
} from './provider';

export type { StoredAsset, StorageProvider } from './storage/StorageProvider';
export { FalCdnPassthroughStorage } from './storage/FalCdnPassthroughStorage';
export { SupabaseStorage, type SupabaseStorageOptions } from './storage/SupabaseStorage';

export {
  ECONOMY_MODELS,
  PREMIUM_MODELS,
  getDefaultModel,
  getActiveModels,
  getEditModel,
  isModelInTier,
} from './model-registry';
export type { Tier } from './model-registry';

export { buildDossierPrompt, buildAvatarPrompt } from './prompts';

export { MediaProviderError, classifyMediaError } from './errors';
export type { MediaErrorCode } from './errors';

export {
  StoredAssetSchema,
  SceneAssetSchema,
  SceneVideoAssetSchema,
  VoiceAssetSchema,
  MasterClipSchema,
  DialogueSchema,
  FirstFrameSourceSchema,
} from './scene-types';
export type {
  SceneAsset,
  SceneVideoAsset,
  VoiceAsset,
  MasterClip,
  Dialogue,
  FirstFrameSource,
} from './scene-types';
