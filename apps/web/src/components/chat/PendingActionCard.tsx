'use client';

import { confirmPendingActionAction } from '@/server/actions/confirmPendingActionAction';
import type { PendingAction } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface Props {
  pending: PendingAction;
  chatMessageId: string;
}

/**
 * Phase 1.2.6 — interactive confirm card для pending action'а в чате.
 * Variant `destructive` — красная рамка + warning-блок + красная primary кнопка
 * (для delete_character и regen-overwrite).
 */
export function PendingActionCard({ pending, chatMessageId }: Props) {
  const [submitting, startTransition] = useTransition();
  const router = useRouter();
  const isDestructive = pending.kind === 'delete_character' || Boolean(pending.preview.warning);

  if (pending.status === 'executed') {
    return <div className="pending-resolved executed">Выполнено</div>;
  }
  if (pending.status === 'cancelled') {
    return <div className="pending-resolved cancelled">Отменено</div>;
  }

  const handle = (decision: 'confirm' | 'cancel') => {
    startTransition(async () => {
      await confirmPendingActionAction({
        chat_message_id: chatMessageId,
        decision,
      });
      router.refresh();
    });
  };

  const confirmLabel = pending.kind === 'delete_character' ? 'Удалить навсегда' : 'Подтвердить';

  return (
    <div
      className={`pending-card${isDestructive ? ' destructive' : ''}`}
      role="region"
      aria-label={pending.preview.title}
    >
      <div className="pending-card-title">{pending.preview.title}</div>
      <div className="pending-card-subject">{pending.preview.subject}</div>
      <div className="pending-card-summary">{pending.preview.summary}</div>
      {pending.preview.warning && (
        <div className="pending-card-warning" role="alert">
          <span aria-hidden="true">⚠</span> {pending.preview.warning}
        </div>
      )}
      <div className="pending-card-actions">
        <button
          type="button"
          className={`pending-card-confirm${isDestructive ? ' destructive' : ''}`}
          disabled={submitting}
          onClick={() => handle('confirm')}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="pending-card-cancel"
          disabled={submitting}
          onClick={() => handle('cancel')}
        >
          Отменить
        </button>
      </div>
    </div>
  );
}
