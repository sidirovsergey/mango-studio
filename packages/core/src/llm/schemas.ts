import 'server-only';
import { z } from 'zod';
import {
  AudioModeSchema,
  DialogueSchema,
  FirstFrameSourceSchema,
  MasterClipSchema,
  MasterClipVersionSchema,
  SceneAssetVersionSchema,
  StoredAssetSchema,
} from '../media/scene-types';
import type { ScriptGenOutput } from './provider';
import { ScriptCharacterActionSchema } from './types';

export const SceneSchema = z.object({
  scene_id: z.string().min(1),
  description: z.string().min(1),
  dialogue: DialogueSchema.nullable(),
  character_ids: z.array(z.string()),
  composition_hint: z.string().optional(),
  duration_sec: z.number().int().min(1).max(30),
  config_overrides: z
    .object({
      tier: z.enum(['economy', 'premium']).optional(),
      model: z.string().optional(),
    })
    .optional(),
  audio_mode: AudioModeSchema.default('auto'),
  first_frame_source: FirstFrameSourceSchema.default('auto_continuity'),

  // Versioned arrays (max 5)
  first_frame_versions: z.array(SceneAssetVersionSchema).max(5),
  first_frame_active_version_id: z.string().nullable(),
  video_versions: z.array(SceneAssetVersionSchema).max(5),
  video_active_version_id: z.string().nullable(),
  voice_audio_versions: z.array(SceneAssetVersionSchema).max(5),
  voice_audio_active_version_id: z.string().nullable(),

  // Derived (auto-recomposed)
  last_frame: z
    .object({
      storage: StoredAssetSchema,
      extracted_from_version_id: z.string(),
    })
    .nullable(),
  final_clip: z
    .object({
      storage: StoredAssetSchema,
      composed_from: z.object({
        video_version_id: z.string(),
        voice_audio_version_id: z.string().nullable(),
      }),
    })
    .nullable(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const NarratorVoiceSchema = z.object({
  tts_voice_id: z.string(),
  description: z.string().optional(),
});

export const ScriptGenSchema = z.object({
  title: z.string().min(1).max(120).describe('Короткий цепляющий заголовок мультика'),
  scenes: z
    .array(SceneSchema)
    .min(2)
    .max(8)
    .describe('2-8 сцен, в сумме укладывающихся в target_duration_sec'),
  characters: z
    .array(ScriptCharacterActionSchema)
    .min(1)
    .max(5)
    .describe('Персонажи: keep/add/remove действия для diff-merge'),
  narrator_voice: NarratorVoiceSchema.optional().describe(
    'Дефолтный голос рассказчика на уровне проекта',
  ),
  master_clip: MasterClipSchema.nullable().default(null),
});

type _SchemaMatchesType = z.infer<typeof ScriptGenSchema> extends ScriptGenOutput
  ? ScriptGenOutput extends z.infer<typeof ScriptGenSchema>
    ? true
    : false
  : false;

const _check: _SchemaMatchesType = true;
void _check;
