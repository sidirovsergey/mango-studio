'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { refineScriptAction } from '@/server/actions/scripts';
import type { ToolChip } from '@mango/core';
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
 * Phase 1.2.6 — apply or dismiss a sync_hint attached to a tool chip.
 * - dismiss: только меняет status='dismissed' на нужном chip.
 * - apply: меняет status='triggered', вызывает refineScriptAction со
 *   suggested_instruction, инсёртит новую assistant row с result chip.
 */
export async function triggerSyncHintAction(rawInput: unknown): Promise<Result> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  const { data: row, error } = await sb
    .from('chat_messages')
    .select('id, project_id, tool_chips, projects(user_id)')
    .eq('id', input.chat_message_id)
    .single();
  if (error || !row) return { ok: false, error: 'message not found' };

  const projects = row.projects as unknown as { user_id: string } | null;
  if (!projects || projects.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const chips = (row.tool_chips ?? []) as unknown as ToolChip[];
  if (input.chip_index < 0 || input.chip_index >= chips.length) {
    return { ok: false, error: 'chip not found' };
  }
  const chip = chips[input.chip_index]!;
  const hint = chip.sync_hint;
  if (!hint) return { ok: false, error: 'chip has no sync hint' };
  if (hint.status !== 'visible') return { ok: true }; // idempotent

  const newStatus = input.decision === 'apply' ? 'triggered' : 'dismissed';
  const updatedChip: ToolChip = {
    ...chip,
    sync_hint: { ...hint, status: newStatus },
  };
  const updatedChips = [...chips];
  updatedChips[input.chip_index] = updatedChip;

  const { error: chipUpdateErr } = await sb
    .from('chat_messages')
    .update({ tool_chips: updatedChips as never })
    .eq('id', row.id);
  if (chipUpdateErr) {
    return { ok: false, error: `chip status update failed: ${chipUpdateErr.message}` };
  }

  if (input.decision === 'apply') {
    let resultChip: ToolChip;
    try {
      await refineScriptAction({
        project_id: row.project_id,
        instruction: hint.suggested_instruction,
      });
      resultChip = {
        kind: 'refine_script',
        label: 'Обновил сценарий',
        ok: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      resultChip = {
        kind: 'refine_script',
        label: `Не обновил сценарий (${message.slice(0, 80)})`,
        ok: false,
        error: message.slice(0, 200),
      };
    }
    const { error: insertErr } = await sb.from('chat_messages').insert({
      project_id: row.project_id,
      role: 'assistant',
      content: '',
      tool_chips: [resultChip] as never,
    });
    if (insertErr) {
      return {
        ok: false,
        error: `chip insert failed: ${insertErr.message} (refine_script мог отработать)`,
      };
    }
  }

  revalidatePath(`/projects/${row.project_id}`);
  return { ok: true };
}
