import 'server-only';
import { createCharacterAction } from '@/server/actions/createCharacterAction';
import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { updateProjectMetaAction } from '@/server/actions/projects';
import { refineCharacterAction } from '@/server/actions/refineCharacterAction';
import {
  addSceneAction,
  deleteSceneAction,
  refineBeatAction,
  refineScriptAction,
  regenScriptAction,
} from '@/server/actions/scripts';
import { unarchiveCharacterAction } from '@/server/actions/unarchiveCharacterAction';
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

    // ===== Character tools (Phase 1.2.5) =====

    add_character: tool({
      description:
        'Добавить нового персонажа в проект. Используй когда пользователь говорит «добавь героя X», «введи персонажа Y». Создаёт карточку с структурированным описанием (description, appearance, personality), но БЕЗ картинки. Чтобы нарисовать — отдельный generate_character.',
      inputSchema: z.object({
        name: z.string().min(1).max(80).describe('Имя персонажа, как его назвал пользователь'),
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe(
            'Описание персонажа от пользователя — всё что юзер сказал про внешность/характер целиком, не сокращая',
          ),
      }),
      execute: async ({ name, instruction }) => {
        try {
          const result = await createCharacterAction({ project_id, name, instruction });
          if (!result.ok) return { ok: false, error: result.error };
          return {
            ok: true,
            character_id: result.character_id,
            name,
            ...(result.partial ? { partial: true } : {}),
          };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    generate_character: tool({
      description:
        'Сгенерировать визуальное досье (картинку) существующего персонажа через fal.ai. character_id бери из блока АКТИВНЫЕ ПЕРСОНАЖИ в системном контексте. ВАЖНО: если has_dossier=true — НЕ вызывай tool сразу, сначала спроси подтверждения текстом. Перегенерация заменит существующую картинку.',
      inputSchema: z.object({
        character_id: z
          .string()
          .uuid()
          .describe('uuid существующего персонажа из блока АКТИВНЫЕ ПЕРСОНАЖИ'),
      }),
      execute: async ({ character_id }) => {
        try {
          const result = await generateCharacterDossierAction({ project_id, character_id });
          if (!result.ok) {
            return { ok: false, error: result.error, error_code: result.error_code };
          }
          return { ok: true, character_id };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    refine_character: tool({
      description:
        'Обновить описание существующего персонажа по инструкции пользователя. Меняет description / appearance / personality, НО НЕ перегенерирует картинку (если уже есть — отдельный generate_character). character_id бери из блока АКТИВНЫЕ ПЕРСОНАЖИ.',
      inputSchema: z.object({
        character_id: z.string().uuid(),
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe('Что изменить в персонаже, в одно-два предложения'),
      }),
      execute: async ({ character_id, instruction }) => {
        try {
          const result = await refineCharacterAction({ project_id, character_id, instruction });
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, character_id };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    unarchive_character: tool({
      description:
        'Восстановить ранее удалённого (archived) персонажа. character_id бери из блока УДАЛЁННЫЕ ПЕРСОНАЖИ в системном контексте. Используй когда пользователь говорит «верни X», «восстанови Y». Если имени нет среди archived — НЕ вызывай tool, ответь текстом.',
      inputSchema: z.object({
        character_id: z.string().uuid(),
      }),
      execute: async ({ character_id }) => {
        try {
          const result = await unarchiveCharacterAction({ project_id, character_id });
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, character_id };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),
  } satisfies ToolSet;
}
