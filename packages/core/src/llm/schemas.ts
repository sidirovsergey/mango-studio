import 'server-only';
import { z } from 'zod';
import {
  AudioModeSchema,
  DialogueSchema,
  FirstFrameSourceSchema,
  MasterClipVersionSchema,
  SceneAssetVersionSchema,
  StoredAssetSchema,
} from '../media/scene-types';
import {
  CompositionSchema,
  CameraMovementSchema,
  LightingSchema,
  AudioDirectionSchema,
  ArcRoleSchema,
  VisualThemeSchema,
} from '../media/cinematography-schemas';
import { ScriptCharacterActionSchema } from './types';

export const SceneSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object') {
      const obj = { ...(raw as Record<string, unknown>) };
      // back-compat: if description_ru missing, mirror from description
      if ('description' in obj && !('description_ru' in obj)) {
        obj.description_ru = (obj as { description: string }).description;
      }
      // F57: composition_hint is dead — strip it so old DB rows parse cleanly
      delete obj.composition_hint;
      return obj;
    }
    return raw;
  },
  z.object({
    scene_id: z.string().min(1),
    description: z.string().min(1),
    description_ru: z.string(),
    description_en: z.string().nullable().default(null),
    duration_sec: z.number().int().min(1).max(30),
    dialogue: DialogueSchema.nullable(),
    character_ids: z.array(z.string()).default([]),
    composition: CompositionSchema.nullable().default(null),
    camera_movement: CameraMovementSchema.nullable().default(null),
    lighting: LightingSchema.nullable().default(null),
    audio_direction: AudioDirectionSchema.nullable().default(null),
    arc_role: ArcRoleSchema.nullable().default(null),
    tier_at_gen: z.enum(['economy', 'premium']).nullable().default(null),

    // Preserved pre-existing fields:
    config_overrides: z
      .object({
        tier: z.enum(['economy', 'premium']).optional(),
        model: z.string().optional(),
      })
      .optional(),
    audio_mode: AudioModeSchema.default('auto'),
    first_frame_source: FirstFrameSourceSchema.default('auto_continuity'),

    // Versioned arrays (max 5)
    first_frame_versions: z.array(SceneAssetVersionSchema).max(5).default([]),
    first_frame_active_version_id: z.string().nullable().default(null),
    video_versions: z.array(SceneAssetVersionSchema).max(5).default([]),
    video_active_version_id: z.string().nullable().default(null),
    voice_audio_versions: z.array(SceneAssetVersionSchema).max(5).default([]),
    voice_audio_active_version_id: z.string().nullable().default(null),

    // Derived (auto-recomposed)
    last_frame: z
      .object({
        storage: StoredAssetSchema,
        extracted_from_version_id: z.string(),
      })
      .nullable()
      .default(null),
    final_clip: z
      .object({
        storage: StoredAssetSchema,
        composed_from: z.object({
          video_version_id: z.string(),
          voice_audio_version_id: z.string().nullable(),
        }),
      })
      .nullable()
      .default(null),
  }),
);

export type Scene = z.infer<typeof SceneSchema>;

export const NarratorVoiceSchema = z.object({
  tts_voice_id: z.string(),
  // Preserved pre-existing field:
  description: z.string().optional(),
  // New voice-settings fields (F35-F38):
  persona: z.string().optional(),
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).optional(),
  speed: z.number().min(0).optional(),
});

export const ScriptGenSchema = z.object({
  title: z.string().min(1).max(120).describe('Короткий цепляющий заголовок мультика'),
  scenes: z
    .array(SceneSchema)
    .min(2)
    .max(20)
    .describe('2-20 сцен, в сумме укладывающихся в target_duration_sec (cadence: 15s→3, 30s→6, 60s→10-12, 90s→14-18)'),
  characters: z
    .array(ScriptCharacterActionSchema)
    .min(1)
    .max(5)
    .describe('Персонажи: keep/add/remove действия для diff-merge'),
  visual_theme: VisualThemeSchema.nullable().default(null),
  tier: z.enum(['economy', 'premium']).nullable().default(null),
  narrator_voice: NarratorVoiceSchema.optional().describe(
    'Дефолтный голос рассказчика на уровне проекта',
  ),
  master_clip_versions: z.array(MasterClipVersionSchema).max(5),
  master_clip_active_version_id: z.string().nullable(),
});

export type Script = z.infer<typeof ScriptGenSchema>;

// NOTE: SchemaMatchesType check is intentionally removed in Phase 1.3.5 —
// the schema diverges from the legacy ScriptGenOutput interface (master_clip → master_clip_versions,
// scene asset fields → versioned arrays). Sub-phase C will reconcile interfaces with new schemas.
