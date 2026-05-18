export type { Tier } from './tier/types';
export { TIERS, isTier } from './tier/types';

export type {
  AspectRatio,
  CharacterDescriptor,
  ProjectBible,
  SceneIntent,
  StyleName,
} from './prompt/types';

export type {
  MediaProvider,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  DossierFormat,
  DossierQuality,
  AssetContext,
  StoredAsset,
  StorageProvider,
  MediaErrorCode,
  SupabaseStorageOptions,
  SceneAsset,
  SceneVideoAsset,
  VoiceAsset,
  MasterClip,
  Dialogue,
  FirstFrameSource,
  VideoModelMeta,
  JobHandle,
  JobResult,
  JobStatus,
  SceneAssetVersion,
  SceneAssetVersionSource,
  MasterClipVersion,
  AudioMode,
  VersionKind,
  VideoPromptInput,
  VideoPromptSceneInput,
  VideoPromptOutput,
  CharacterInScene,
} from './media';
export {
  ECONOMY_MODELS,
  PREMIUM_MODELS,
  getDefaultModel,
  getActiveModels,
  getEditModel,
  isModelInTier,
  buildDossierPrompt,
  buildAvatarPrompt,
  buildReferenceImagePrompt,
  buildFirstFramePrompt,
  MediaProviderError,
  classifyMediaError,
  FalCdnPassthroughStorage,
  SupabaseStorage,
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
  buildVideoPrompt,
  buildVoicePrompt,
} from './media';
export type { Style, FirstFramePromptInput } from './media';

export type {
  ChatInput,
  ChatMessage,
  ChatOutput,
  ChatResult,
  LLMProvider,
  LLMUsage,
  PersistedScript,
  RefineSceneInput,
  RefineSceneOutput,
  RefineSceneResult,
  ScriptGenInput,
  ScriptGenOutput,
  ScriptGenResult,
  Scene,
  NarratorVoice,
  Character,
  Dossier,
  ReferenceImage,
  ScriptCharacterAction,
  StoredAssetParsed,
} from './llm';
export { normalizeScene } from './llm';
export {
  LLMProviderError,
  classifyLLMError,
  getModelParams,
  buildDirectorSystemPrompt,
  buildScriptPrompt,
  applyCharacterActions,
  CharacterSchema,
  AppearanceSchema,
  detectSyncHint,
} from './llm';
export type {
  LLMTask,
  ModelParams,
  BuildScriptPromptContext,
  DirectorContext,
  ToolChip,
  ToolChipKind,
  SyncHint,
  SyncHintStatus,
  RegenHint,
  RegenHintStatus,
  PendingAction,
  PendingActionKind,
  PendingActionStatus,
  PendingActionPreview,
  SyncHintKind,
  SyncHintScene,
} from './llm';

export * from './queue';

// Audio pipeline rip-out (2026-05-13): VOICE_POOL, resolveAudioMode,
// planNextChainStep and friends deleted alongside ElevenLabs TTS and the
// silent_tts → mux chain. Every active video model now generates native
// audio. Old projects still parse — their voice_audio_versions /
// final_clip / narrator_voice fields stay on the jsonb but are inert.

export * from './media/scene-versions';

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
} from './media/cinematography-schemas';
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
} from './media/cinematography-schemas';

export type {
  AccountTier,
  MediaJobKind,
  ModelTier,
  PriceQuote,
  PriceQuoteInput,
  PriceBreakdown,
} from './quota';
export {
  TierGateError,
  assertCapability,
  BalanceGateError,
  priceKopeks,
  priceQuote,
  assertBalance,
  aggregateProjectPrice,
} from './quota';
export type { AggregateSceneSpec, AggregatePriceInput } from './quota';

export {
  TOPUP_PACKAGE_KOPEKS,
  TopupInputSchema,
  TopupIntentSchema,
  TopupPackageCodeSchema,
} from './billing';
export type { TopupInput, TopupIntent, TopupPackageCode } from './billing';

// NOTE: `ScriptGenSchema`/`ScriptSchema`/`SceneSchema` (from `./llm/schemas`)
// and `upgradeScene`/`upgradeScript`/`downgradeScript` (from `./llm/migration`)
// are deliberately NOT re-exported here — both files have client-incompatible
// imports (`'server-only'` and `node:crypto` respectively), and a barrel re-export
// poisons every client component that imports `@mango/core`. Server-side and CLI
// consumers should import directly from `@mango/core/llm/schemas` and
// `@mango/core/llm/migration`.
