import 'server-only';
import { z } from 'zod';
import type { ScriptGenOutput } from './provider';
import { ScriptCharacterActionSchema } from './types';

export const SceneSchema = z.object({
  scene_id: z.string().min(1).describe('Уникальный id сцены, например s1, s2'),
  description: z
    .string()
    .min(1)
    .describe('Описание сцены, что в ней происходит, для media-генерации'),
  duration_sec: z.number().int().min(1).max(30).describe('Длительность сцены в секундах'),
  voiceover: z.string().optional().describe('Реплика/закадровый голос для этой сцены'),
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
});

type _SchemaMatchesType = z.infer<typeof ScriptGenSchema> extends ScriptGenOutput
  ? ScriptGenOutput extends z.infer<typeof ScriptGenSchema>
    ? true
    : false
  : false;

const _check: _SchemaMatchesType = true;
void _check;
