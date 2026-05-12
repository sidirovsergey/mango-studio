export type {
  MediaProvider,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  GenerateFirstFrameInput,
  GenerateSceneVideoInput,
  GenerateVoiceInput,
  ComposeFinalClipInput,
  ConcatMasterInput,
  ExtractLastFrameInput,
  JobHandle,
  JobResult,
  JobStatus,
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
export type { Style } from './prompts';
export { buildReferenceImagePrompt } from './image-prompts/reference-image';
export { buildFirstFramePrompt } from './image-prompts/first-frame';
export type { FirstFramePromptInput } from './image-prompts/first-frame';

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
export {
  SceneAssetVersionSchema,
  MasterClipVersionSchema,
  AudioModeSchema,
  VersionKindSchema,
} from './scene-types';
export type {
  SceneAsset,
  SceneVideoAsset,
  VoiceAsset,
  MasterClip,
  Dialogue,
  FirstFrameSource,
  SceneAssetVersion,
  SceneAssetVersionSource,
  MasterClipVersion,
  AudioMode,
  VersionKind,
} from './scene-types';

export {
  VIDEO_MODELS,
  VOICE_MODELS,
  MUX_MODEL,
  CONCAT_MODEL,
  EXTRACT_LAST_FRAME_MODEL,
  getDefaultVideoModel,
  getActiveVideoModels,
  getVideoModelMeta,
  isVideoModelInTier,
  getDefaultVoiceModel,
  clampDurationToModel,
} from './video-models';
export type { VideoModelMeta } from './video-models';

export { buildVoicePrompt } from './video-prompts';
export { buildVideoPrompt } from './video-prompts/index';
export type {
  VideoPromptInput,
  VideoPromptSceneInput,
  VideoPromptOutput,
  CharacterInScene,
} from './video-prompts/index';

export {
  ShotSizeSchema,
  CameraAngleSchema,
  CompositionSchema,
  CameraMovementKindSchema,
  CameraMovementSchema,
  LightingSchema,
  AudioDirectionSchema,
  ArcRoleSchema,
  VisualThemeSchema,
} from './cinematography-schemas';
export type {
  ShotSize,
  CameraAngle,
  Composition,
  CameraMovementKind,
  CameraMovement,
  Lighting,
  AudioDirection,
  ArcRole,
  VisualTheme,
} from './cinematography-schemas';
