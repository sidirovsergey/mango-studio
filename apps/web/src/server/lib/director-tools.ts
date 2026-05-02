import 'server-only';
import { randomUUID } from 'node:crypto';
import { archiveCharacterAction } from '@/server/actions/archiveCharacterAction';
import { createCharacterAction } from '@/server/actions/createCharacterAction';
import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { updateProjectMetaAction } from '@/server/actions/projects';
import {
  addSceneAction,
  deleteSceneAction,
  refineBeatAction,
  refineScriptAction,
  regenScriptAction,
} from '@/server/actions/scripts';
import { unarchiveCharacterAction } from '@/server/actions/unarchiveCharacterAction';
import type { Character, PendingAction } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { tool } from 'ai';
import type { ToolSet } from 'ai';
import { z } from 'zod';

interface DirectorToolsCtx {
  project_id: string;
}

function shortError(err: unknown): string {
  return ((err as Error)?.message ?? 'unknown error').slice(0, 200);
}

/**
 * Phase 1.2.6 — резолвит character ИЗ snapshot скрипта в БД.
 * Используется для построения preview pending action'а.
 */
async function resolveCharacter(
  project_id: string,
  character_id: string,
): Promise<Character | null> {
  const sb = await getServerSupabase();
  const { data: project, error } = await sb
    .from('projects')
    .select('script')
    .eq('id', project_id)
    .single();
  if (error || !project) return null;
  const script = (project.script ?? {}) as { characters?: Character[] };
  return script.characters?.find((c) => c.id === character_id) ?? null;
}

interface PendingResult {
  pending: true;
  action: PendingAction;
}

interface ImmediateOk {
  ok: true;
  // additional fields permitted
  [k: string]: unknown;
}

interface ImmediateFail {
  ok: false;
  error: string;
}

type ToolResult = ImmediateOk | ImmediateFail | PendingResult;

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
        'Добавить НОВОГО персонажа в проект. Используй когда пользователь говорит «добавь героя X», «введи персонажа Y» И ТАКОГО ПЕРСОНАЖА ЕЩЁ НЕТ в проекте. Если персонаж с таким именем уже существует (активный или архивный) — НЕ вызывай add_character: либо unarchive_character (если он в архиве), либо refine_character (если в активных и нужно изменить), либо ответь текстом что он уже есть.',
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
        // Phase 1.2.6 — duplicate guard. Без этого Director может насоздавать
        // дубликатов одного и того же персонажа в archived (как было на staging
        // — 3 «Синих кота» с разными id из-за silent INSERT failure cycle).
        try {
          const sb = await getServerSupabase();
          const { data: project } = await sb
            .from('projects')
            .select('script')
            .eq('id', project_id)
            .single();
          const script = (project?.script ?? {}) as { characters?: Character[] };
          const trimmed = name.trim().toLowerCase();
          const existing = (script.characters ?? []).filter(
            (c) => c.name.trim().toLowerCase() === trimmed,
          );
          const existingActive = existing.find((c) => !c.archived);
          if (existingActive) {
            return {
              ok: false,
              error: `Персонаж «${existingActive.name}» уже есть в активных. Используй refine_character для изменения, не add_character.`,
            };
          }
          if (existing.length > 0) {
            // Все нашлись в archived → suggest unarchive
            const archIds = existing.map((c) => c.id).join(', ');
            return {
              ok: false,
              error: `Персонаж «${name}» уже есть в архивных (id: ${archIds}). Используй unarchive_character для возврата.`,
            };
          }
        } catch (err) {
          // Если guard упал — пускаем прежний flow (лучше дубликат чем заблокировать)
          console.warn('[add_character] duplicate guard failed:', err);
        }

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
        'Сгенерировать визуальное досье персонажа через fal.ai (~10–20 сек). character_id из блока АКТИВНЫЕ ПЕРСОНАЖИ. Если has_dossier=false — выполнится сразу. Если has_dossier=true — система автоматически покажет destructive карточку подтверждения regen. НЕ спрашивай в чате текстом, просто вызови tool.',
      inputSchema: z.object({
        character_id: z.string().uuid().describe('uuid персонажа из блока АКТИВНЫЕ ПЕРСОНАЖИ'),
      }),
      execute: async ({ character_id }): Promise<ToolResult> => {
        const character = await resolveCharacter(project_id, character_id);
        if (!character) return { ok: false, error: 'character not found' };

        // Если досье ещё нет — выполняем сразу (никакого confirm)
        if (!character.dossier) {
          try {
            const result = await generateCharacterDossierAction({ project_id, character_id });
            if (!result.ok) {
              return { ok: false, error: result.error };
            }
            return { ok: true, character_id };
          } catch (err) {
            return { ok: false, error: shortError(err) };
          }
        }

        // has_dossier=true → pending regen с destructive preview
        const action: PendingAction = {
          id: randomUUID(),
          kind: 'generate_character_regen',
          payload: { project_id, character_id },
          preview: {
            title: 'Перерисовать досье',
            subject: character.name,
            summary: 'Существующая картинка будет заменена. Стоимость ~$0.08–0.39.',
            warning: 'Прежнюю картинку восстановить нельзя.',
          },
          status: 'pending',
        };
        return { pending: true, action };
      },
    }),

    refine_character: tool({
      description:
        'Обновить ОПИСАНИЕ персонажа (description/appearance/personality). Картинка не перерисовывается. Система автоматически покажет карточку подтверждения с превью изменения — НЕ спрашивай в чате, просто вызови tool. character_id из АКТИВНЫХ ПЕРСОНАЖЕЙ.',
      inputSchema: z.object({
        character_id: z.string().uuid(),
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe('Что изменить в персонаже, в одно-два предложения'),
      }),
      execute: async ({ character_id, instruction }): Promise<ToolResult> => {
        const character = await resolveCharacter(project_id, character_id);
        if (!character) return { ok: false, error: 'character not found' };
        const action: PendingAction = {
          id: randomUUID(),
          kind: 'refine_character',
          payload: { project_id, character_id, instruction },
          preview: {
            title: 'Обновить описание персонажа',
            subject: character.name,
            summary: instruction,
          },
          status: 'pending',
        };
        return { pending: true, action };
      },
    }),

    archive_character: tool({
      description:
        'Заархивировать (soft-delete) персонажа. Восстановимо через unarchive_character. Используй когда пользователь говорит «удали X», «убери Y», «больше не нужен Z». character_id из АКТИВНЫХ ПЕРСОНАЖЕЙ. БЕЗ confirm — выполни сразу.',
      inputSchema: z.object({
        character_id: z.string().uuid(),
      }),
      execute: async ({ character_id }): Promise<ToolResult> => {
        try {
          const result = await archiveCharacterAction({ project_id, character_id });
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, character_id };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    unarchive_character: tool({
      description:
        'Восстановить ранее удалённого (archived) персонажа. character_id из блока УДАЛЁННЫЕ ПЕРСОНАЖИ в системном контексте. Используй когда пользователь говорит «верни X», «восстанови Y». Если имени нет среди archived — НЕ вызывай tool, ответь текстом.',
      inputSchema: z.object({
        character_id: z.string().uuid(),
      }),
      execute: async ({ character_id }): Promise<ToolResult> => {
        try {
          const result = await unarchiveCharacterAction({ project_id, character_id });
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, character_id };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    delete_character: tool({
      description:
        'УДАЛИТЬ ПЕРСОНАЖА НАВСЕГДА. Используй ТОЛЬКО при явных «удали навсегда» / «удали окончательно» / «удали полностью» / «насовсем». character_id из АКТИВНЫХ ПЕРСОНАЖЕЙ. Сначала система покажет destructive карточку подтверждения — НЕ переспрашивай в чате текстом.',
      inputSchema: z.object({
        character_id: z.string().uuid(),
      }),
      execute: async ({ character_id }): Promise<ToolResult> => {
        const character = await resolveCharacter(project_id, character_id);
        if (!character) return { ok: false, error: 'character not found' };
        const action: PendingAction = {
          id: randomUUID(),
          kind: 'delete_character',
          payload: { project_id, character_id },
          preview: {
            title: 'Удалить персонажа НАВСЕГДА',
            subject: character.name,
            summary: 'Карточка и досье будут удалены полностью.',
            warning: 'Это нельзя отменить. Если хочешь восстановимое — скажи «заархивируй».',
          },
          status: 'pending',
        };
        return { pending: true, action };
      },
    }),
  } satisfies ToolSet;
}
