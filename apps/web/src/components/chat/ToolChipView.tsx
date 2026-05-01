'use client';

import { triggerSyncHintAction } from '@/server/actions/triggerSyncHintAction';
import type { ToolChip } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface Props {
  chip: ToolChip;
  chatMessageId: string;
  chipIndex: number;
}

/**
 * Phase 1.2.6 — рендерит один tool chip + опционально под ним sync-hint mini-chip.
 * Layout вертикальный: основной chip → (опционально) ℹ-bar с кнопкой «Обновить сценарий».
 */
export function ToolChipView({ chip, chatMessageId, chipIndex }: Props) {
  return (
    <div className="tool-chip-group">
      <div className={`tool-chip ${chip.ok ? 'ok' : 'fail'}`} role="status" aria-live="polite">
        <span className="tool-chip-icon" aria-hidden="true">
          {chip.ok ? '✓' : '✕'}
        </span>
        <span className="tool-chip-label">{chip.label}</span>
      </div>
      {chip.sync_hint && (
        <SyncHintRow chip={chip} chatMessageId={chatMessageId} chipIndex={chipIndex} />
      )}
    </div>
  );
}

function SyncHintRow({ chip, chatMessageId, chipIndex }: Props) {
  const [submitting, startTransition] = useTransition();
  const router = useRouter();
  const hint = chip.sync_hint;
  if (!hint) return null;

  const handle = (decision: 'apply' | 'dismiss') => {
    startTransition(async () => {
      await triggerSyncHintAction({
        chat_message_id: chatMessageId,
        chip_index: chipIndex,
        decision,
      });
      router.refresh();
    });
  };

  if (hint.status === 'triggered') {
    return <div className="sync-hint-resolved triggered">Сценарий обновляется…</div>;
  }
  if (hint.status === 'dismissed') {
    return <div className="sync-hint-resolved dismissed">Подсказка скрыта</div>;
  }
  return (
    <div className="sync-hint-chip">
      <span className="sync-hint-icon" aria-hidden="true">
        i
      </span>
      <span className="sync-hint-reason">{hint.reason}</span>
      <button
        type="button"
        className="sync-hint-action"
        disabled={submitting}
        onClick={() => handle('apply')}
      >
        Обновить сценарий
      </button>
      <button
        type="button"
        className="sync-hint-dismiss"
        disabled={submitting}
        onClick={() => handle('dismiss')}
        aria-label="Скрыть подсказку"
      >
        ×
      </button>
    </div>
  );
}
