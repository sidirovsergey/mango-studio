'use client';
import Link from 'next/link';
import type { AccountTier, MediaJobKind } from '@mango/core';

export interface TierGateModalState {
  kind: MediaJobKind;
  required_tier: AccountTier;
}

interface Props {
  state: TierGateModalState;
  onClose: () => void;
}

export function TierGateModal({ state, onClose }: Props) {
  const ctaText =
    state.required_tier === 'free' ? 'Войти и разблокировать' : 'Перейти на Premium';
  const ctaHref = state.required_tier === 'free' ? '/login' : '/upgrade';
  return (
    <div className="tg-modal-backdrop" onClick={onClose}>
      <div className="tg-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Доступно после входа</h3>
        <p>
          Видео генерируется бесплатно — нужен только email, чтобы сохранить ваши проекты.
        </p>
        <Link href={ctaHref} className="tg-cta">
          {ctaText}
        </Link>
        <button type="button" className="tg-close" onClick={onClose}>
          Не сейчас
        </button>
      </div>
    </div>
  );
}
