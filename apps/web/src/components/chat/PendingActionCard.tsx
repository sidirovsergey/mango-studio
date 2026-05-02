'use client';

import { confirmPendingActionAction } from '@/server/actions/confirmPendingActionAction';
import type { PendingAction } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

interface Props {
  pending: PendingAction;
  chatMessageId: string;
}

const READY_DELAY_MS = 450;

/**
 * Phase 1.2.6 — interactive confirm card для pending action'а в чате.
 * Variant `destructive` — красная рамка + warning-блок + красная primary кнопка
 * (для delete_character и regen-overwrite).
 *
 * Phase 1.2.6 fix-4 — defensive against accidental auto-fire:
 *   1. Buttons disabled первые ~450ms после mount'а (pre-mount focus / kbd-bubbling
 *      events не должны вызвать confirm/cancel неявно).
 *   2. Server-side ok:false теперь surface'ится в UI (раньше юзер не видел
 *      error и не понимал почему ничего не произошло).
 */
export function PendingActionCard({ pending, chatMessageId }: Props) {
  const [submitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const isDestructive = pending.kind === 'delete_character' || Boolean(pending.preview.warning);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), READY_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (pending.status === 'executed') {
    return <div className="pending-resolved executed">Выполнено</div>;
  }
  if (pending.status === 'cancelled') {
    return <div className="pending-resolved cancelled">Отменено</div>;
  }

  const handle = (decision: 'confirm' | 'cancel') => {
    if (!ready || submitting) return;
    setActionError(null);
    startTransition(async () => {
      const result = await confirmPendingActionAction({
        chat_message_id: chatMessageId,
        decision,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const confirmLabel = pending.kind === 'delete_character' ? 'Удалить навсегда' : 'Подтвердить';
  const buttonsDisabled = submitting || !ready;

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
      {actionError && (
        <div className="pending-card-warning" role="alert">
          <span aria-hidden="true">⚠</span> Не получилось: {actionError}
        </div>
      )}
      <div className="pending-card-actions">
        <button
          type="button"
          className={`pending-card-confirm${isDestructive ? ' destructive' : ''}`}
          disabled={buttonsDisabled}
          onClick={() => handle('confirm')}
        >
          {submitting ? 'Подождите…' : confirmLabel}
        </button>
        <button
          type="button"
          className="pending-card-cancel"
          disabled={buttonsDisabled}
          onClick={() => handle('cancel')}
        >
          Отменить
        </button>
      </div>
    </div>
  );
}
