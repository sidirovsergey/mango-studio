import 'server-only';
import type { PendingAction, ToolChip, ToolChipKind } from '@mango/core';

/**
 * Phase 1.2.6 — extract tool calls/results from AI SDK steps into:
 *   - chips: array of intermediate ToolChip (with `_raw` carrier for enrichChips)
 *   - pending: первый встреченный pending tool, остальные → conflictError
 *
 * Tools, возвращающие `{ pending: true, action: {...} }`, не дают chip — только pending.
 * Tools, возвращающие `{ ok: boolean, ... }`, дают immediate chip.
 *
 * Constraint: не больше одного pending action в одном turn'е. Если LLM вернул
 * несколько — берём первый, остальные отбрасываем + добавляем conflictError chip.
 */

const KNOWN_TOOL_KINDS = new Set<ToolChipKind>([
  'refine_script',
  'regen_script',
  'add_scene',
  'delete_scene',
  'refine_beat',
  'update_project_meta',
  'add_character',
  'archive_character',
  'unarchive_character',
  'refine_character',
  'generate_character',
  'delete_character',
  // Phase 1.3 scene tools
  'regen_scene_video',
  'refine_scene_description',
  'set_scene_duration',
  'set_scene_model',
  'generate_first_frame',
  'generate_master_clip',
]);

export interface RawToolChip extends ToolChip {
  /** Carrier для enrichChips — args + result оригинального tool call'а. Стрипается на финале. */
  _raw?: { args: unknown; result: Record<string, unknown> };
}

interface AIStepLike {
  toolCalls?: ReadonlyArray<{ toolName: string; args?: unknown; input?: unknown }>;
  toolResults?: ReadonlyArray<{
    toolName: string;
    result?: unknown;
    output?: unknown;
  }>;
}

export interface ExtractedToolSteps {
  chips: RawToolChip[];
  pending: PendingAction | null;
  conflictError?: ToolChip;
}

function getToolArgs(call: { args?: unknown; input?: unknown } | undefined): unknown {
  if (!call) return undefined;
  return call.args ?? call.input;
}

function getToolResult(
  toolResult: { result?: unknown; output?: unknown } | undefined,
): Record<string, unknown> | undefined {
  if (!toolResult) return undefined;
  const raw = toolResult.result ?? toolResult.output;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
}

export function extractToolSteps(steps: ReadonlyArray<AIStepLike> | undefined): ExtractedToolSteps {
  const chips: RawToolChip[] = [];
  let pending: PendingAction | null = null;
  let extraPending = 0;

  if (!steps || steps.length === 0) return { chips, pending };

  for (const step of steps) {
    const calls = step.toolCalls ?? [];
    const results = step.toolResults ?? [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const toolName = r.toolName as ToolChipKind;
      if (!KNOWN_TOOL_KINDS.has(toolName)) continue;

      const result = getToolResult(r);
      if (!result) continue;

      const args = getToolArgs(calls[i]);

      // Pending shape: { pending: true, action: {...} }
      if (result.pending === true) {
        const actionRaw = result.action;
        if (actionRaw && typeof actionRaw === 'object') {
          if (pending === null) {
            pending = actionRaw as PendingAction;
          } else {
            extraPending += 1;
          }
        }
        continue;
      }

      // Immediate shape: { ok: boolean, error?, ... }
      const ok = result.ok === true;
      const errorRaw = result.error;
      const error = !ok && typeof errorRaw === 'string' ? errorRaw : undefined;

      const chip: RawToolChip = {
        kind: toolName,
        label: '', // placeholder — overwritten by enrichChips
        ok,
        ...(error ? { error } : {}),
        _raw: { args, result },
      };
      chips.push(chip);
    }
  }

  if (extraPending > 0) {
    return {
      chips,
      pending,
      conflictError: {
        kind: 'refine_script', // arbitrary — chip is informational
        label: `Больше одного действия с подтверждением в одном запросе нельзя — лишних отброшено: ${extraPending}`,
        ok: false,
        error: 'multiple-pending',
      },
    };
  }

  return { chips, pending };
}
