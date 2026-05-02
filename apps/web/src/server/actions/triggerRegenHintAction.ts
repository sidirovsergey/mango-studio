'use server';

import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/get-user';
import type { Character, PendingAction, ToolChip } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  chat_message_id: z.string().uuid(),
  chip_index: z.number().int().min(0),
  decision: z.enum(['apply', 'dismiss']),
});

type Result = { ok: true } | { ok: false; error: string };

/**
 * Phase 1.2.6 fix-3 — apply/dismiss regen_hint на chip.
 * `apply`: помечает hint как 'triggered' + инсёртит новую assistant row с
 * `pending_action` (kind=generate_character_regen) — юзер увидит destructive
 * pending-карточку «Перерисовать досье» и подтвердит обычным flow.
 * `dismiss`: только меняет status='dismissed'.
 */
export async function triggerRegenHintAction(rawInput: unknown): Promise<Result> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  const { data: row, error } = await sb
    .from('chat_messages')
    .select('id, project_id, tool_chips, projects(user_id, script)')
    .eq('id', input.chat_message_id)
    .single();
  if (error || !row) return { ok: false, error: 'message not found' };

  const projects = row.projects as unknown as { user_id: string; script: unknown } | null;
  if (!projects || projects.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const chips = (row.tool_chips ?? []) as unknown as ToolChip[];
  if (input.chip_index < 0 || input.chip_index >= chips.length) {
    return { ok: false, error: 'chip not found' };
  }
  const chip = chips[input.chip_index]!;
  const hint = chip.regen_hint;
  if (!hint) return { ok: false, error: 'chip has no regen hint' };
  if (hint.status !== 'visible') return { ok: true }; // idempotent

  const newStatus = input.decision === 'apply' ? 'triggered' : 'dismissed';
  const updatedChip: ToolChip = {
    ...chip,
    regen_hint: { ...hint, status: newStatus },
  };
  const updatedChips = [...chips];
  updatedChips[input.chip_index] = updatedChip;

  const { data: chipData, error: chipUpdateErr } = await sb
    .from('chat_messages')
    .update({ tool_chips: updatedChips as never })
    .eq('id', row.id)
    .select('id');
  if (chipUpdateErr) {
    return { ok: false, error: `chip status update failed: ${chipUpdateErr.message}` };
  }
  if (!chipData || chipData.length === 0) {
    return { ok: false, error: 'chip status UPDATE affected 0 rows (RLS?)' };
  }

  if (input.decision === 'apply') {
    // Verify character existence + dossier presence ещё раз (защита от race)
    const script = (projects.script ?? {}) as { characters?: Character[] };
    const character = (script.characters ?? []).find((c) => c.id === hint.character_id);
    if (!character) {
      return { ok: false, error: 'character not found' };
    }
    if (!character.dossier) {
      // Нет досье — нечего regen'ить, делаем generate_character как immediate
      // через прямой вызов action'а. Но проще оставить юзеру: выкинем error,
      // пусть скажет «нарисуй» в чате.
      return { ok: false, error: 'у персонажа ещё нет досье — вызови «нарисуй» в чате' };
    }

    const action: PendingAction = {
      id: randomUUID(),
      kind: 'generate_character_regen',
      payload: { project_id: row.project_id, character_id: hint.character_id },
      preview: {
        title: 'Перерисовать досье',
        subject: hint.character_name,
        summary: 'Описание персонажа изменилось — пересоздадим картинку под новые черты.',
        warning: 'Прежнюю картинку восстановить нельзя.',
      },
      status: 'pending',
    };

    const { error: insertErr } = await sb.from('chat_messages').insert({
      project_id: row.project_id,
      role: 'assistant',
      content: '',
      pending_action: action as never,
    });
    if (insertErr) {
      return {
        ok: false,
        error: `pending insert failed: ${insertErr.message}`,
      };
    }
  }

  revalidatePath(`/projects/${row.project_id}`);
  return { ok: true };
}
