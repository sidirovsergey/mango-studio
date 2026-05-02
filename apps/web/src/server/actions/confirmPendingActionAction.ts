'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { deleteCharacterAction } from '@/server/actions/deleteCharacterAction';
import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { refineCharacterAction } from '@/server/actions/refineCharacterAction';
import {
  type Character,
  type PendingAction,
  type SyncHintScene,
  type ToolChip,
  detectSyncHint,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  chat_message_id: z.string().uuid(),
  decision: z.enum(['confirm', 'cancel']),
});

type Result = { ok: true; already_resolved?: boolean } | { ok: false; error: string };

/**
 * Phase 1.2.6 — execute or cancel a pending action attached to a chat message.
 *
 * Source-of-truth для payload — БД, не клиент. Клиент шлёт только
 * `chat_message_id` + `decision`. Idempotent: повторный confirm уже
 * выполненного / отменённого pending — no-op success.
 */
export async function confirmPendingActionAction(rawInput: unknown): Promise<Result> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  // Load row + verify ownership через projects FK
  const { data: row, error: selErr } = await sb
    .from('chat_messages')
    .select('id, project_id, pending_action, projects(user_id, script)')
    .eq('id', input.chat_message_id)
    .single();
  if (selErr || !row) return { ok: false, error: 'message not found' };

  const projects = row.projects as unknown as { user_id: string; script: unknown } | null;
  if (!projects || projects.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const pa = row.pending_action as PendingAction | null;
  if (!pa) return { ok: false, error: 'no pending action' };
  if (pa.status !== 'pending') return { ok: true, already_resolved: true };

  const project_id = row.project_id;
  const now = new Date().toISOString();

  if (input.decision === 'cancel') {
    const cancelled: PendingAction = { ...pa, status: 'cancelled', resolved_at: now };
    const { data: cancelData, error: cancelErr } = await sb
      .from('chat_messages')
      .update({ pending_action: cancelled as never })
      .eq('id', row.id)
      .select('id');
    if (cancelErr) return { ok: false, error: `cancel update failed: ${cancelErr.message}` };
    // Phase 1.2.6 fix-3: RLS может молча блокировать UPDATE → 0 rows. Без проверки
    // .select() мы думали что cancel прошёл, а статус оставался pending.
    if (!cancelData || cancelData.length === 0) {
      return { ok: false, error: 'cancel update affected 0 rows (RLS?)' };
    }
    revalidatePath(`/projects/${project_id}`);
    return { ok: true };
  }

  // confirm — execute the underlying action by kind
  const script = (projects.script ?? {}) as { characters?: Character[]; scenes?: SyncHintScene[] };
  const characters = script.characters ?? [];
  const scenes = script.scenes ?? [];
  const payload = pa.payload;

  let chip: ToolChip;

  switch (pa.kind) {
    case 'refine_character': {
      const r = await refineCharacterAction(payload);
      const characterId = typeof payload.character_id === 'string' ? payload.character_id : '';
      const character = characters.find((c) => c.id === characterId);
      const name = character?.name ?? 'персонажа';
      if (r.ok) {
        const sync_hint = character ? detectSyncHint(character, scenes, 'refine') : undefined;
        // Phase 1.2.6 fix-3 — если у персонажа было досье, его описание изменилось
        // → картинка устарела → предлагаем перерисовать через regen_hint.
        const regen_hint = character?.dossier
          ? {
              character_id: characterId,
              character_name: name,
              status: 'visible' as const,
            }
          : undefined;
        chip = {
          kind: 'refine_character',
          label: `Обновил «${name}»`,
          ok: true,
          ...(sync_hint ? { sync_hint } : {}),
          ...(regen_hint ? { regen_hint } : {}),
        };
      } else {
        chip = {
          kind: 'refine_character',
          label: `Не обновил «${name}» (${r.error})`,
          ok: false,
          error: r.error,
        };
      }
      break;
    }
    case 'generate_character_regen': {
      const r = await generateCharacterDossierAction(payload);
      const characterId = typeof payload.character_id === 'string' ? payload.character_id : '';
      const character = characters.find((c) => c.id === characterId);
      const name = character?.name ?? 'персонажа';
      if (r.ok) {
        chip = {
          kind: 'generate_character',
          label: `Перерисовал «${name}»`,
          ok: true,
        };
      } else {
        const code = r.error_code ?? r.error;
        chip = {
          kind: 'generate_character',
          label: `Не перерисовал «${name}» (${code})`,
          ok: false,
          error: r.error,
        };
      }
      break;
    }
    case 'delete_character': {
      // Resolve name BEFORE delete (after delete character is gone from snapshot)
      const characterId = typeof payload.character_id === 'string' ? payload.character_id : '';
      const character = characters.find((c) => c.id === characterId);
      const name = character?.name ?? 'персонажа';
      const r = await deleteCharacterAction(payload);
      if (r.ok) {
        chip = {
          kind: 'delete_character',
          label: `Удалил «${name}»`,
          ok: true,
        };
      } else {
        chip = {
          kind: 'delete_character',
          label: `Не удалил «${name}» (${r.error})`,
          ok: false,
          error: r.error,
        };
      }
      break;
    }
    default: {
      const _exhaustive: never = pa.kind;
      return { ok: false, error: `unknown pending kind: ${String(_exhaustive)}` };
    }
  }

  // Mark original row as executed
  const executed: PendingAction = { ...pa, status: 'executed', resolved_at: now };
  const { data: execData, error: execUpdateErr } = await sb
    .from('chat_messages')
    .update({ pending_action: executed as never })
    .eq('id', row.id)
    .select('id');
  if (execUpdateErr) {
    return { ok: false, error: `execute update failed: ${execUpdateErr.message}` };
  }
  // Phase 1.2.6 fix-3: RLS UPDATE молча no-op'ит → status остаётся pending →
  // пользователь может кликать «Подтвердить» снова и снова, каждый раз
  // re-applying мутацию. Если 0 rows — фейлим явно.
  if (!execData || execData.length === 0) {
    return {
      ok: false,
      error:
        'execute UPDATE affected 0 rows (RLS UPDATE policy missing on chat_messages?). Мутация прошла, но pending status остался.',
    };
  }

  // Insert result row with the chip
  const { error: insertErr } = await sb.from('chat_messages').insert({
    project_id,
    role: 'assistant',
    content: '',
    tool_chips: [chip] as never,
  });
  if (insertErr) {
    // Lifecycle уже executed (мутация прошла) — но юзер не увидит chip.
    // Возвращаем error чтобы клиент знал что что-то не так, но мутация всё равно применилась.
    return {
      ok: false,
      error: `chip insert failed: ${insertErr.message} (мутация применена, но chip не сохранён)`,
    };
  }

  revalidatePath(`/projects/${project_id}`);
  return { ok: true };
}
