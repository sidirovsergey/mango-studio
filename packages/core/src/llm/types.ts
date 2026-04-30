import { z } from 'zod';

export const StoredAssetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fal_passthrough'), url: z.string().url() }),
  z.object({ kind: z.literal('supabase'), path: z.string().min(1) }),
]);

export const DossierSchema = z.object({
  storage: StoredAssetSchema,
  model: z.string().min(1),
  format: z.literal('16:9'),
  quality: z.enum(['720p', '1080p', '2k']),
  generated_at: z.string(),
});

export const ReferenceImageSchema = z.object({
  storage: StoredAssetSchema,
  source: z.enum(['user_upload', 'ai_generated']),
  uploaded_at: z.string(),
});

export const VoiceSchema = z
  .object({
    description: z.string().optional(),
    tts_provider: z.enum(['grok', 'elevenlabs']).optional(),
    tts_voice_id: z.string().optional(),
  })
  .default({});

export const AppearanceSchema = z
  .object({
    age: z.string().optional(),
    build: z.string().optional(),
    species: z.string().optional(),
    distinctive: z.array(z.string()).optional(),
  })
  .default({});

export const ConfigOverridesSchema = z
  .object({
    model: z.string().optional(),
    style: z.enum(['3d_pixar', '2d_drawn', 'clay_art']).optional(),
    quality: z.enum(['720p', '1080p', '2k']).optional(),
  })
  .optional();

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(''),
  full_prompt: z.string().default(''),
  appearance: AppearanceSchema,
  personality: z.string().optional(),
  voice: VoiceSchema,
  dossier: DossierSchema.nullable().default(null),
  reference_images: z.array(ReferenceImageSchema).default([]),
  config_overrides: ConfigOverridesSchema,
  archived: z.boolean().optional(),
});

export type Character = z.infer<typeof CharacterSchema>;
// Named StoredAssetParsed to avoid conflict with StoredAsset from media/storage
export type StoredAssetParsed = z.infer<typeof StoredAssetSchema>;
export type Dossier = z.infer<typeof DossierSchema>;
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>;

export const ScriptCharacterActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep'), id: z.string().uuid() }),
  z.object({
    action: z.literal('add'),
    name: z.string().min(1),
    description: z.string(),
    appearance: AppearanceSchema.optional(),
    personality: z.string().optional(),
  }),
  z.object({ action: z.literal('remove'), id: z.string().uuid() }),
]);

export type ScriptCharacterAction = z.infer<typeof ScriptCharacterActionSchema>;
