import 'server-only';
import { randomUUID } from 'node:crypto';
import { archiveCharacterAction } from '@/server/actions/archiveCharacterAction';
import { createCharacterAction } from '@/server/actions/createCharacterAction';
import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { updateProjectMetaAction } from '@/server/actions/projects';
import { regenSceneTextAction } from '@/server/actions/regenSceneTextAction';
import {
  addSceneAction,
  deleteSceneAction,
  refineBeatAction,
  refineScriptAction,
  regenScriptAction,
} from '@/server/actions/scripts';
// setCharacterVoiceAction import removed 2026-05-13 with the audio pipeline.
import { setSceneDurationAction } from '@/server/actions/setSceneDurationAction';
import { unarchiveCharacterAction } from '@/server/actions/unarchiveCharacterAction';
import type { Character, PendingAction } from '@mango/core';
import { VIDEO_MODELS } from '@mango/core';
import { formatCostHint } from '@mango/core/media/prompt-cost';
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

/**
 * Phase 1.3 — резолвит scene из snapshot скрипта в БД.
 * Используется для построения preview pending action'а.
 */
async function resolveScene(
  project_id: string,
  scene_id: string,
): Promise<{
  scene_id: string;
  description: string;
  duration_sec: number;
  first_frame: unknown;
  final_clip: unknown;
  config_overrides?: { model?: string };
  dialogue?: { speaker: string; text: string } | null;
} | null> {
  const sb = await getServerSupabase();
  const { data: project, error } = await sb
    .from('projects')
    .select('script')
    .eq('id', project_id)
    .single();
  if (error || !project) return null;
  const script = (project.script ?? {}) as {
    scenes?: Array<{
      scene_id: string;
      description: string;
      duration_sec: number;
      first_frame: unknown;
      final_clip: unknown;
      config_overrides?: { model?: string };
      dialogue?: { speaker: string; text: string } | null;
    }>;
  };
  return script.scenes?.find((s) => s.scene_id === scene_id) ?? null;
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
        'Создать нового персонажа. `instruction` — что юзер сказал про внешность/характер целиком, без сокращения.',
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
            summary: `Текущая картинка будет заменена новой. Стоимость ${formatCostHint(character.dossier?.model ?? 'fal-ai/nano-banana-pro')}.`,
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

    // Voice tools removed 2026-05-13 — native-audio video models render
    // character voices implicitly from the dialogue text. Director can no
    // longer be asked to set_character_voice; the action is gone.

    // ===== Scene tools (Phase 1.3) =====

    regen_scene_video: tool({
      description:
        'Перегенерировать видео для сцены. Используй когда пользователь просит обновить движение/ракурс/анимацию конкретной сцены. Cost-significant — система покажет pending карточку. Не переспрашивай в чате.',
      inputSchema: z.object({
        scene_id: z.string().min(1).describe('ID сцены, например s1, s2'),
      }),
      execute: async ({ scene_id }): Promise<ToolResult> => {
        const scene = await resolveScene(project_id, scene_id);
        if (!scene) return { ok: false, error: 'scene not found' };
        if (!scene.first_frame)
          return {
            ok: false,
            error: 'у сцены ещё нет первого кадра — сначала сгенерируй его',
          };
        const action: PendingAction = {
          id: randomUUID(),
          kind: 'regen_scene_video',
          payload: { project_id, scene_id },
          preview: {
            title: `Перегенерировать видео сцены ${scene_id}?`,
            subject: scene.description.slice(0, 60),
            summary: `Запустит новую video gen — ${formatCostHint(scene.config_overrides?.model ?? VIDEO_MODELS.premium.default)}.`,
          },
          status: 'pending',
        };
        return { pending: true, action };
      },
    }),

    refine_scene_description: tool({
      description:
        'Обновить описание/реплику сцены через LLM mini-call. Используй когда пользователь просит «измени реплику», «перепиши описание», «сделай эту сцену смешнее».',
      inputSchema: z.object({
        scene_id: z.string().min(1),
        instruction: z.string().min(1).max(500),
      }),
      execute: async ({ scene_id, instruction }): Promise<ToolResult> => {
        try {
          const result = await regenSceneTextAction({ project_id, scene_id, instruction });
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, scene_id, dialogue: result.dialogue };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    set_scene_duration: tool({
      description:
        "Изменить длительность сцены. Сервер автоматически clamp'нет к ближайшему supported значению модели. Используй когда пользователь говорит «сделай сцену 8 секунд», «короче», «длиннее».",
      inputSchema: z.object({
        scene_id: z.string().min(1),
        duration_sec: z.number().int().min(1).max(30),
      }),
      execute: async ({ scene_id, duration_sec }): Promise<ToolResult> => {
        try {
          const result = await setSceneDurationAction({ project_id, scene_id, duration_sec });
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, scene_id, clamped_to: result.clamped_to };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    set_scene_model: tool({
      description:
        'Сменить video model для одной сцены. Cost-significant — система покажет pending карточку. Используй когда пользователь просит конкретную модель: «используй Veo для этой сцены», «попробуй Seedance Lite». model должен быть из доступных в текущем tier.',
      inputSchema: z.object({
        scene_id: z.string().min(1),
        model: z.string().min(1),
      }),
      execute: async ({ scene_id, model }): Promise<ToolResult> => {
        const scene = await resolveScene(project_id, scene_id);
        if (!scene) return { ok: false, error: 'scene not found' };
        const action: PendingAction = {
          id: randomUUID(),
          kind: 'set_scene_model',
          payload: { project_id, scene_id, model },
          preview: {
            title: `Сменить модель сцены ${scene_id}?`,
            subject: model.split('/').pop() ?? model,
            summary:
              'Существующее видео сцены не удаляется, но станет stale — нужно будет пересобрать.',
          },
          status: 'pending',
        };
        return { pending: true, action };
      },
    }),

    generate_first_frame: tool({
      description:
        'Сгенерировать первый кадр сцены (image gen). Используй когда пользователь говорит «нарисуй сцену», «сделай кадр», «сгенерируй первый frame». Без confirm.',
      inputSchema: z.object({
        scene_id: z.string().min(1),
      }),
      execute: async ({ scene_id }): Promise<ToolResult> => {
        try {
          const result = await generateFirstFrameAction({ project_id, scene_id });
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, scene_id, job_id: result.job_id, existing: result.existing };
        } catch (err) {
          return { ok: false, error: shortError(err) };
        }
      },
    }),

    generate_master_clip: tool({
      description:
        'Финализировать ролик (склейка всех сцен). Cost-significant. Каждая сцена должна иметь активный video (final_clip — это устаревший mux-артефакт; native-audio video из новых моделей даёт звук напрямую через ffmpeg merge-videos). Используй когда пользователь говорит «собери ролик», «финализируй», «склей все сцены».',
      inputSchema: z.object({}),
      execute: async (): Promise<ToolResult> => {
        const sb = await getServerSupabase();
        const { data: project } = await sb
          .from('projects')
          .select('script')
          .eq('id', project_id)
          .single();
        if (!project) return { ok: false, error: 'project not found' };
        // Codex audit P1.3: master_clip used to require every scene to have a
        // muxed final_clip — but post-2026-05-13 (audio rip-out) new scenes
        // never produce final_clip; native audio is baked into the video
        // version directly and ffmpeg merge-videos preserves it through
        // concat. Readiness now means: every scene has an active video
        // version (final_clip still counts as ready for legacy projects).
        const script = project.script as {
          scenes?: Array<{
            final_clip?: unknown;
            video_active_version_id?: string | null;
            video_versions?: Array<unknown>;
          }>;
        } | null;
        const scenes = script?.scenes ?? [];
        const totalScenes = scenes.length;
        const readyScenes = scenes.filter(
          (s) =>
            s.final_clip != null ||
            (s.video_active_version_id != null &&
              Array.isArray(s.video_versions) &&
              s.video_versions.length > 0),
        ).length;
        if (readyScenes < totalScenes) {
          return {
            ok: false,
            error: `готово ${readyScenes} из ${totalScenes} сцен — сначала закончи остальные`,
          };
        }
        const action: PendingAction = {
          id: randomUUID(),
          kind: 'generate_master_clip',
          payload: { project_id, scene_count: totalScenes },
          preview: {
            title: 'Финализировать ролик?',
            subject: `${totalScenes} сцен`,
            summary: `Склейка через ffmpeg — ${formatCostHint('fal-ai/ffmpeg-api/merge-videos')}.`,
          },
          status: 'pending',
        };
        return { pending: true, action };
      },
    }),

    rollback_scene_version: tool({
      description:
        'Откатить активную версию ассета сцены на указанную (или предыдущую если не указано). Применять когда юзер просит «верни прошлый кадр», «не нравится текущий, откати», «верни v2». Это destructive action — затрагивает downstream final_clip и master_clip stale state. Поэтому требуется confirm через pending-action card.',
      inputSchema: z.object({
        scene_id: z.string().min(1).describe('ID сцены, например s1, s2'),
        kind: z
          .enum(['first_frame', 'video', 'voice_audio', 'master_clip'])
          .describe('Какой ассет откатывать'),
        target_version_id: z
          .string()
          .min(1)
          .optional()
          .describe('ID конкретной версии; если не указано — откат на предыдущую'),
      }),
      execute: async ({ scene_id, kind, target_version_id }): Promise<ToolResult> => {
        const scene = await resolveScene(project_id, scene_id);
        if (!scene) return { ok: false, error: 'scene not found' };
        const targetSummary = target_version_id
          ? `версия ${target_version_id}`
          : 'предыдущая версия';
        const action: PendingAction = {
          id: randomUUID(),
          kind: 'rollback_scene_version',
          payload: {
            project_id,
            scene_id,
            kind,
            ...(target_version_id ? { target_version_id } : {}),
          },
          preview: {
            title: `Откатить ${kind} сцены ${scene_id}?`,
            subject: scene.description.slice(0, 60),
            summary: `Активная версия будет переключена на ${targetSummary}. Downstream final_clip / master_clip станут stale.`,
            warning:
              'Это действие может затронуть собранный ролик — потребуется пересборка master_clip.',
          },
          status: 'pending',
        };
        return { pending: true, action };
      },
    }),

    // Codex audit P1.4: regen_scene_voice + compose_scene_final_clip director
    // tools removed alongside the ElevenLabs TTS chain (audio rip-out
    // 2026-05-13). Native-audio video models render dialogue inline; there's
    // no separate voice job to regenerate and no final_clip to mux.
  } satisfies ToolSet;
}
