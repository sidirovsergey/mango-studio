import { z } from 'zod';

export const StoredAssetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fal_passthrough'), url: z.string().url() }),
  z.object({
    kind: z.literal('supabase'),
    bucket: z.string().min(1).default('scene-assets'),
    path: z.string().min(1),
  }),
]);

export const SceneAssetSchema = z.object({
  storage: StoredAssetSchema,
  model: z.string(),
  generated_at: z.string(),
  fal_request_id: z.string().optional(),
  source: z.enum(['ai_text2img', 'ai_img2img_continuity', 'user_upload']).optional(),
  stale: z.boolean().optional(),
});

export type SceneAsset = z.infer<typeof SceneAssetSchema>;

export const SceneVideoAssetSchema = z.object({
  storage: StoredAssetSchema,
  model: z.string(),
  generated_at: z.string(),
  fal_request_id: z.string(),
  duration_sec: z.number().int().min(1).max(30),
  source: z.enum(['ai_img2vid', 'user_upload']),
  has_native_audio: z.boolean(),
  stale: z.boolean().optional(),
});

export type SceneVideoAsset = z.infer<typeof SceneVideoAssetSchema>;

export const VoiceAssetSchema = z.object({
  storage: StoredAssetSchema,
  tts_provider: z.string(),
  voice_id: z.string(),
  generated_at: z.string(),
  fal_request_id: z.string().optional(),
});

export type VoiceAsset = z.infer<typeof VoiceAssetSchema>;

export const MasterClipSchema = z.object({
  storage: StoredAssetSchema,
  generated_at: z.string(),
  scene_ids_snapshot: z.array(z.string()),
  fal_request_id: z.string().optional(),
  stale: z.boolean().optional(),
});

export type MasterClip = z.infer<typeof MasterClipSchema>;

export const DialogueSchema = z.object({
  speaker: z.union([z.literal('narrator'), z.string()]),
  text: z.string(),
});

export type Dialogue = z.infer<typeof DialogueSchema>;

export const FirstFrameSourceSchema = z.enum(['auto_continuity', 'manual_text2img', 'user_upload']);

export type FirstFrameSource = z.infer<typeof FirstFrameSourceSchema>;

// ============== Phase 1.3.5: versioned scene assets ==============

export const SceneAssetVersionSourceSchema = z.enum([
  'auto_continuity',
  'manual_text2img',
  'user_upload',
]);
export type SceneAssetVersionSource = z.infer<typeof SceneAssetVersionSourceSchema>;

export const SceneAssetVersionSchema = z.object({
  version_id: z.string().min(1),
  storage: StoredAssetSchema,
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  generated_at: z.string(),
  cost_usd: z.number().nullable(),
  has_native_audio: z.boolean().optional(),
  source: SceneAssetVersionSourceSchema,
});
export type SceneAssetVersion = z.infer<typeof SceneAssetVersionSchema>;

export const MasterClipComposedSchema = z.object({
  scene_id: z.string(),
  video_version_id: z.string(),
  voice_audio_version_id: z.string().nullable(),
});

export const MasterClipVersionSchema = z.object({
  version_id: z.string().min(1),
  storage: StoredAssetSchema,
  generated_at: z.string(),
  cost_usd: z.number().nullable(),
  composed_from_scene_versions: z.array(MasterClipComposedSchema),
});
export type MasterClipVersion = z.infer<typeof MasterClipVersionSchema>;

export const VersionKindSchema = z.enum(['first_frame', 'video', 'voice_audio', 'master_clip']);
export type VersionKind = z.infer<typeof VersionKindSchema>;

export const AudioModeSchema = z.enum(['native', 'silent_tts', 'auto']);
export type AudioMode = z.infer<typeof AudioModeSchema>;
