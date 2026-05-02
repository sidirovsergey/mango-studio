import 'server-only';
import { z } from 'zod';
import type { ScriptGenOutput } from './provider';
import { ScriptCharacterActionSchema } from './types';
import {
  DialogueSchema,
  SceneAssetSchema,
  SceneVideoAssetSchema,
  VoiceAssetSchema,
  MasterClipSchema,
  FirstFrameSourceSchema,
} from '../media/scene-types';

export const SceneSchema = z.object({
  scene_id: z.string().min(1).describe('Уникальный id сцены, например s1, s2'),
  description: z
    .string()
    .min(1)
    .describe('Описание сцены, что в ней происходит, для media-генерации'),
  duration_sec: z.number().int().min(1).max(30).describe('Длительность сцены в секундах'),
  dialogue: DialogueSchema.nullable().describe(
    "Реплика для сцены: {speaker: 'narrator' | character_id, text}. null если сцена немая.",
  ),
  character_ids: z
    .array(z.string())
    .describe('id персонажей, видимых в сцене. Пустой массив если только окружение.'),
  composition_hint: z
    .string()
    .optional()
    .describe('Опциональная композиционная подсказка типа "close-up Алисы"'),
  first_frame_source: FirstFrameSourceSchema.default('auto_continuity'),
  first_frame: SceneAssetSchema.nullable().default(null),
  last_frame: SceneAssetSchema.nullable().default(null),
  video: SceneVideoAssetSchema.nullable().default(null),
  voice_audio: VoiceAssetSchema.nullable().default(null),
  final_clip: SceneAssetSchema.nullable().default(null),
});

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
