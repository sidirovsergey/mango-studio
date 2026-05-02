import { z } from 'zod';

export const StoredAssetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fal_passthrough'), url: z.string().url() }),
  z.object({ kind: z.literal('supabase'), path: z.string().min(1) }),
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

export const FirstFrameSourceSchema = z.enum([
  'auto_continuity',
  'manual_text2img',
  'user_upload',
]);

export type FirstFrameSource = z.infer<typeof FirstFrameSourceSchema>;
