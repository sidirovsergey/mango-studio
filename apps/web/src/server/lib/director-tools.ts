import 'server-only';
import { updateProjectMetaAction } from '@/server/actions/projects';
import {
  addSceneAction,
  deleteSceneAction,
  refineBeatAction,
  refineScriptAction,
  regenScriptAction,
} from '@/server/actions/scripts';
import { tool } from 'ai';
import type { ToolSet } from 'ai';
import { z } from 'zod';

interface DirectorToolsCtx {
  project_id: string;
}

function shortError(err: unknown): string {
  return ((err as Error)?.message ?? 'unknown error').slice(0, 200);
}

export function buildDirectorTools({ project_id }: DirectorToolsCtx): ToolSet {
  return {
    refine_script: tool({
      description:
        'Полностью переписать сценарий проекта по инструкции пользователя. Используй когда пользователь просит изменить сценарий целиком: «сделай веселее», «добавь героиню», «переделай развязку грустнее».',
      inputSchema: z.object({
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe('Что именно изменить в сценарии, сформулировано чётко в одно-два предложения'),
      }),
      execute: async ({ instruction }) => {
        try {
          const result = await refineScriptAction({ project_id, instruction });
          return {
            ok: true,
            new_title: result.title,
            scene_count: result.scenes.length,
          };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    regen_script: tool({
      description:
        'Сгенерировать сценарий заново с нуля. Используй когда пользователь говорит «переделай всё», «не нравится, заново», «давай совсем другой сценарий».',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const result = await regenScriptAction({ project_id });
          return {
            ok: true,
            new_title: result.title,
            scene_count: result.scenes.length,
          };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    add_scene: tool({
      description:
        'ДОБАВИТЬ новую сцену В КОНЕЦ существующего сценария. Используй когда пользователь говорит «добавь сцену», «добавь ещё сцену про X», «вставь сцену с Y». Этот tool создаёт ОДНУ новую сцену и аппендит к массиву — общее количество сцен увеличивается на 1. НЕ используй refine_script для добавления — он переписывает весь сценарий с нуля и количество сцен может остаться тем же.',
      inputSchema: z.object({
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe('О чём должна быть новая сцена (одно-два предложения от пользователя)'),
      }),
      execute: async ({ instruction }) => {
        try {
          const result = await addSceneAction({ project_id, instruction });
          const newScene = result.scenes[result.scenes.length - 1];
          return {
            ok: true,
            scene_count: result.scenes.length,
            new_scene_id: newScene?.scene_id,
          };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    delete_scene: tool({
      description:
        'Удалить ОДНУ конкретную сцену из сценария. Используй когда пользователь говорит «удали сцену 3», «убери четвёртую», «выкинь сцену с офисом». scene_id бери из текущего сценария в системном контексте (s1, s2, ...). НЕ используй refine_beat для удаления — он только меняет описание, не удаляет сцену.',
      inputSchema: z.object({
        scene_id: z.string().min(1).describe('Идентификатор сцены, например "s1", "s2"'),
      }),
      execute: async ({ scene_id }) => {
        try {
          const result = await deleteSceneAction({ project_id, scene_id });
          return { ok: true, scene_count: result.scenes.length };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    refine_beat: tool({
      description:
        'Обновить ОДНУ конкретную сцену (бит) сценария — изменить её ОПИСАНИЕ. scene_id бери из текущего сценария в системном контексте (s1, s2, s3...). Для удаления сцены используй delete_scene, не этот tool.',
      inputSchema: z.object({
        scene_id: z.string().min(1).describe('Идентификатор сцены, например "s1", "s2"'),
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe('Что изменить в этой сцене, чётко в одно-два предложения'),
      }),
      execute: async ({ scene_id, instruction }) => {
        try {
          const result = await refineBeatAction({ project_id, scene_id, instruction });
          return { ok: true, scene_id, updated_description: result.updated_description };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    update_project_meta: tool({
      description:
        'Изменить параметры проекта: длительность, формат кадра или стиль. Используй когда пользователь просит «сделай длиннее», «измени стиль на пластилин», «сделай горизонтальный».',
      inputSchema: z.object({
        target_duration_sec: z
          .union([
            z.literal(15),
            z.literal(20),
            z.literal(30),
            z.literal(40),
            z.literal(60),
            z.literal(90),
          ])
          .optional()
          .describe('Длительность мультика в секундах'),
        format: z
          .enum(['9:16', '16:9', '1:1'])
          .optional()
          .describe('Формат кадра: вертикальный 9:16, горизонтальный 16:9, квадратный 1:1'),
        style: z
          .enum(['3d_pixar', '2d_drawn', 'clay_art'])
          .optional()
          .describe('Визуальный стиль: 3d_pixar, 2d_drawn (рисованный), clay_art (пластилин)'),
      }),
      execute: async (fields) => {
        try {
          await updateProjectMetaAction({ project_id, ...fields });
          return { ok: true, applied: fields };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    // Helper for the LLM to fall back when user message is ambiguous (forces text reply).
    // No-op — present so model has an explicit "do nothing" option besides the destructive tools.
    // Not strictly needed, but reduces accidental tool calls on chit-chat.
  } satisfies ToolSet;
}
