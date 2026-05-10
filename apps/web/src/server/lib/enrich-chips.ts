import 'server-only';
import {
  type Character,
  type SyncHintScene,
  type ToolChip,
  type ToolChipKind,
  detectSyncHint,
} from '@mango/core';
import type { RawToolChip } from './extract-tool-steps';

/**
 * Phase 1.2.6 — превращает raw chips из extractToolSteps в финальные ToolChip
 * с человеческими label'ами + sync_hint'ами там где применимо.
 *
 * Source-of-truth для имён: snapshot characters/scenes из script на момент
 * вызова chat.ts (до tool execution). Для add_character имя приходит в
 * args/result. Для остальных — резолв через character_id lookup.
 */

export interface EnrichContext {
  characters: Pick<Character, 'id' | 'name' | 'description' | 'archived'>[];
  scenes: SyncHintScene[];
}

export function enrichChips(rawChips: RawToolChip[], ctx: EnrichContext): ToolChip[] {
  return rawChips.map((rc) => buildFinalChip(rc, ctx));
}

function buildFinalChip(rc: RawToolChip, ctx: EnrichContext): ToolChip {
  const args = (rc._raw?.args ?? {}) as Record<string, unknown>;
  const result = (rc._raw?.result ?? {}) as Record<string, unknown>;

  const name = resolveCharacterName(rc.kind, args, result, ctx.characters);
  const label = buildLabel(rc.kind, name, rc.ok, rc.error, args, result);
  const sync_hint = maybeSyncHint(rc.kind, name, ctx);

  const chip: ToolChip = {
    kind: rc.kind,
    label,
    ok: rc.ok,
  };
  if (rc.error && !rc.ok) chip.error = rc.error;
  if (sync_hint) chip.sync_hint = sync_hint;
  return chip;
}

function resolveCharacterName(
  kind: ToolChipKind,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  characters: EnrichContext['characters'],
): string {
  // add_character — имя приходит в args/result (character ещё не в snapshot'е)
  if (kind === 'add_character') {
    const fromResult = typeof result.name === 'string' ? result.name : undefined;
    const fromArgs = typeof args.name === 'string' ? args.name : undefined;
    return fromResult ?? fromArgs ?? 'персонажа';
  }
  // Остальные character tools — lookup по id
  if (
    kind === 'archive_character' ||
    kind === 'unarchive_character' ||
    kind === 'refine_character' ||
    kind === 'generate_character' ||
    kind === 'delete_character'
  ) {
    const id =
      typeof args.character_id === 'string'
        ? args.character_id
        : typeof result.character_id === 'string'
          ? result.character_id
          : undefined;
    if (!id) return 'персонажа';
    const c = characters.find((x) => x.id === id);
    return c?.name ?? 'персонажа';
  }
  return '';
}

interface LabelOkArgs {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}
interface LabelFailArgs {
  name: string;
  error?: string;
}

const LABELS: Partial<
  Record<
    ToolChipKind,
    {
      ok: (a: LabelOkArgs) => string;
      fail: (a: LabelFailArgs) => string;
    }
  >
> = {
  add_character: {
    ok: ({ name }) => `Добавил «${name}»`,
    fail: ({ name, error }) => `Не добавил «${name}»${error ? ` (${error})` : ''}`,
  },
  archive_character: {
    ok: ({ name }) => `Заархивировал «${name}»`,
    fail: ({ name, error }) => `Не заархивировал «${name}»${error ? ` (${error})` : ''}`,
  },
  unarchive_character: {
    ok: ({ name }) => `Вернул «${name}»`,
    fail: ({ error }) => `Не вернул${error ? ` (${error})` : ''}`,
  },
  refine_character: {
    ok: ({ name }) => `Обновил «${name}»`,
    fail: ({ name, error }) => `Не обновил «${name}»${error ? ` (${error})` : ''}`,
  },
  generate_character: {
    ok: ({ name }) => `Нарисовал «${name}»`,
    fail: ({ name, error }) => `Не нарисовал «${name}»${error ? ` (${error})` : ''}`,
  },
  delete_character: {
    ok: ({ name }) => `Удалил «${name}»`,
    fail: ({ name, error }) => `Не удалил «${name}»${error ? ` (${error})` : ''}`,
  },
  refine_script: {
    ok: () => 'Обновил сценарий',
    fail: ({ error }) => `Не обновил сценарий${error ? ` (${error})` : ''}`,
  },
  regen_script: {
    ok: () => 'Сгенерировал сценарий заново',
    fail: ({ error }) => `Не получилось${error ? ` (${error})` : ''}`,
  },
  add_scene: {
    ok: ({ result }) => {
      const n = typeof result.scene_count === 'number' ? result.scene_count : null;
      return n ? `Добавил сцену ${n}` : 'Добавил сцену';
    },
    fail: ({ error }) => `Не добавил сцену${error ? ` (${error})` : ''}`,
  },
  delete_scene: {
    ok: () => 'Удалил сцену',
    fail: ({ error }) => `Не удалил${error ? ` (${error})` : ''}`,
  },
  refine_beat: {
    ok: ({ args }) => {
      const id = typeof args.scene_id === 'string' ? args.scene_id : null;
      return id ? `Обновил сцену ${id}` : 'Обновил сцену';
    },
    fail: ({ error }) => `Не обновил${error ? ` (${error})` : ''}`,
  },
  update_project_meta: {
    ok: () => 'Обновил параметры',
    fail: ({ error }) => `Не обновил параметры${error ? ` (${error})` : ''}`,
  },
  // Phase 1.3 scene tools
  regen_scene_video: {
    ok: ({ args }) => {
      const id = typeof args.scene_id === 'string' ? args.scene_id : null;
      return id ? `🎬 Перегенерил видео сцены ${id}` : '🎬 Перегенерил видео сцены';
    },
    fail: ({ error }) => `Не перегенерил видео${error ? ` (${error})` : ''}`,
  },
  refine_scene_description: {
    ok: ({ args }) => {
      const id = typeof args.scene_id === 'string' ? args.scene_id : null;
      return id ? `✏️ Обновил описание сцены ${id}` : '✏️ Обновил описание сцены';
    },
    fail: ({ error }) => `Не обновил описание сцены${error ? ` (${error})` : ''}`,
  },
  set_scene_duration: {
    ok: ({ args, result }) => {
      const id = typeof args.scene_id === 'string' ? args.scene_id : null;
      const clamped = typeof result.clamped_to === 'number' ? result.clamped_to : null;
      if (id && clamped !== null) return `⏱️ Сцена ${id}: ${clamped}с`;
      if (id) return `⏱️ Обновил длительность сцены ${id}`;
      return '⏱️ Обновил длительность сцены';
    },
    fail: ({ error }) => `Не обновил длительность${error ? ` (${error})` : ''}`,
  },
  set_scene_model: {
    ok: ({ args }) => {
      const id = typeof args.scene_id === 'string' ? args.scene_id : null;
      const model =
        typeof args.model === 'string' ? (args.model.split('/').pop() ?? args.model) : null;
      if (id && model) return `✏️ Сменил модель сцены ${id} на ${model}`;
      return '✏️ Сменил модель сцены';
    },
    fail: ({ error }) => `Не сменил модель сцены${error ? ` (${error})` : ''}`,
  },
  generate_first_frame: {
    ok: ({ args }) => {
      const id = typeof args.scene_id === 'string' ? args.scene_id : null;
      return id ? `✨ Нарисовал кадр сцены ${id}` : '✨ Нарисовал кадр сцены';
    },
    fail: ({ error }) => `Не нарисовал кадр${error ? ` (${error})` : ''}`,
  },
  generate_master_clip: {
    ok: () => '🎞️ Запустил финальную склейку',
    fail: ({ error }) => `Не запустил склейку${error ? ` (${error})` : ''}`,
  },
};

function buildLabel(
  kind: ToolChipKind,
  name: string,
  ok: boolean,
  error: string | undefined,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): string {
  const fmt = LABELS[kind];
  if (!fmt) {
    if (ok) return 'Готово';
    return error ? `Ошибка (${error})` : 'Ошибка';
  }
  return ok ? fmt.ok({ name, args, result }) : fmt.fail({ name, error });
}

function maybeSyncHint(kind: ToolChipKind, name: string, ctx: EnrichContext) {
  if (!name || name === 'персонажа') return undefined;
  // Только character mutations, которые меняют связь героя со сценами
  if (
    kind !== 'refine_character' &&
    kind !== 'archive_character' &&
    kind !== 'unarchive_character'
  ) {
    return undefined;
  }
  const character = ctx.characters.find((c) => c.name === name);
  if (!character) return undefined;
  const map = {
    refine_character: 'refine',
    archive_character: 'archive',
    unarchive_character: 'unarchive',
  } as const;
  return detectSyncHint(character, ctx.scenes, map[kind]);
}
