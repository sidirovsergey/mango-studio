'use client';

import { triggerRegenHintAction } from '@/server/actions/triggerRegenHintAction';
import { triggerSyncHintAction } from '@/server/actions/triggerSyncHintAction';
import type { ToolChip, ToolChipKind } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

interface Props {
  chip: ToolChip;
  chatMessageId: string;
  chipIndex: number;
}

const READY_DELAY_MS = 450;

/** Phase 1.3 — per-kind icon map. Falls back to ✓/✕ if not listed. */
const CHIP_ICONS: Partial<Record<ToolChipKind, string>> = {
  // Script / scene structural
  refine_script: '✏️',
  regen_script: '✨',
  add_scene: '➕',
  delete_scene: '🗑️',
  refine_beat: '✏️',
  update_project_meta: '⚙️',
  // Character tools
  add_character: '✨',
  archive_character: '📦',
  unarchive_character: '📤',
  refine_character: '✏️',
  generate_character: '🎨',
  delete_character: '🗑️',
  // Phase 1.3 scene tools
  regen_scene_video: '🎬',
  refine_scene_description: '✏️',
  set_scene_duration: '⏱️',
  set_scene_model: '⚙️',
  generate_first_frame: '✨',
  generate_master_clip: '🎞️',
};

/**
 * Phase 1.2.6 — рендерит один tool chip + опционально mini-chip'ы:
 *   1. sync-hint  — «обновить сценарий» (refine/archive/unarchive персонажа)
 *   2. regen-hint — «перерисовать досье» (после refine_character если есть dossier)
 *
 * Phase 1.2.6 fix-4 — defensive: 450ms задержка на ready, error UI, disabled
 * states. Те же гарантии что у PendingActionCard.
 * Phase 1.3 — per-kind icon mapping via CHIP_ICONS.
 */
export function ToolChipView({ chip, chatMessageId, chipIndex }: Props) {
  const icon = chip.ok ? (CHIP_ICONS[chip.kind] ?? '✓') : '✕';
  return (
    <div className="tool-chip-group">
      <div className={`tool-chip ${chip.ok ? 'ok' : 'fail'}`} role="status" aria-live="polite">
        <span className="tool-chip-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="tool-chip-label">{chip.label}</span>
      </div>
      {chip.sync_hint && (
        <SyncHintRow chip={chip} chatMessageId={chatMessageId} chipIndex={chipIndex} />
      )}
      {chip.regen_hint && (
        <RegenHintRow chip={chip} chatMessageId={chatMessageId} chipIndex={chipIndex} />
      )}
    </div>
  );
}

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), READY_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return ready;
}

function SyncHintRow({ chip, chatMessageId, chipIndex }: Props) {
  const [submitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const ready = useReady();
  const router = useRouter();
  const hint = chip.sync_hint;
  if (!hint) return null;

  const handle = (decision: 'apply' | 'dismiss') => {
    if (!ready || submitting) return;
    setActionError(null);
    startTransition(async () => {
      const result = await triggerSyncHintAction({
        chat_message_id: chatMessageId,
        chip_index: chipIndex,
        decision,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (hint.status === 'triggered') {
    return <div className="sync-hint-resolved triggered">Сценарий обновлён ✓</div>;
  }
  if (hint.status === 'dismissed') {
    return <div className="sync-hint-resolved dismissed">Подсказка скрыта</div>;
  }
  const buttonsDisabled = submitting || !ready;
  return (
    <>
      <div className="sync-hint-chip">
        <div className="sync-hint-content">
          <span className="sync-hint-icon" aria-hidden="true">
            i
          </span>
          <span className="sync-hint-reason">{hint.reason}</span>
        </div>
        <div className="sync-hint-actions">
          <button
            type="button"
            className="sync-hint-action"
            disabled={buttonsDisabled}
            onClick={() => handle('apply')}
          >
            {submitting ? 'Подождите…' : 'Обновить сценарий'}
          </button>
          <button
            type="button"
            className="sync-hint-dismiss"
            disabled={buttonsDisabled}
            onClick={() => handle('dismiss')}
            aria-label="Скрыть подсказку"
          >
            ×
          </button>
        </div>
      </div>
      {actionError && (
        <div className="sync-hint-resolved dismissed" role="alert">
          ⚠ {actionError}
        </div>
      )}
    </>
  );
}

function RegenHintRow({ chip, chatMessageId, chipIndex }: Props) {
  const [submitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const ready = useReady();
  const router = useRouter();
  const hint = chip.regen_hint;
  if (!hint) return null;

  const handle = (decision: 'apply' | 'dismiss') => {
    if (!ready || submitting) return;
    setActionError(null);
    startTransition(async () => {
      const result = await triggerRegenHintAction({
        chat_message_id: chatMessageId,
        chip_index: chipIndex,
        decision,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (hint.status === 'triggered') {
    return <div className="sync-hint-resolved triggered">Запрос на перерисовку отправлен ✓</div>;
  }
  if (hint.status === 'dismissed') {
    return <div className="sync-hint-resolved dismissed">Подсказка скрыта</div>;
  }
  const buttonsDisabled = submitting || !ready;
  return (
    <>
      <div className="sync-hint-chip">
        <div className="sync-hint-content">
          <span className="sync-hint-icon" aria-hidden="true">
            ✎
          </span>
          <span className="sync-hint-reason">
            Описание «{hint.character_name}» изменилось — досье устарело
          </span>
        </div>
        <div className="sync-hint-actions">
          <button
            type="button"
            className="sync-hint-action"
            disabled={buttonsDisabled}
            onClick={() => handle('apply')}
          >
            {submitting ? 'Подождите…' : 'Перерисовать досье'}
          </button>
          <button
            type="button"
            className="sync-hint-dismiss"
            disabled={buttonsDisabled}
            onClick={() => handle('dismiss')}
            aria-label="Скрыть подсказку"
          >
            ×
          </button>
        </div>
      </div>
      {actionError && (
        <div className="sync-hint-resolved dismissed" role="alert">
          ⚠ {actionError}
        </div>
      )}
    </>
  );
}
