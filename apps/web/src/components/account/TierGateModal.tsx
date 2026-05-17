'use client';
import type { AccountTier, MediaJobKind } from '@mango/core';
import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';

export interface TierGateModalState {
  kind: MediaJobKind;
  required_tier: AccountTier;
}

interface Props {
  state: TierGateModalState;
  onClose: () => void;
}

interface Copy {
  title: string;
  body: string;
  ctaText: string;
  ctaHref: string;
}

/**
 * Branch the copy on `required_tier`, not just the CTA href:
 *  - required_tier='free'    → user is anonymous, needs email auth
 *  - required_tier='premium' → user is authed on free, needs upgrade
 * Codex E audit caught the original copy was auth-only and would mislead
 * free→premium gates.
 */
function copyForTier(tier: AccountTier): Copy {
  if (tier === 'premium') {
    return {
      title: 'Premium-функция',
      body: 'Эта возможность доступна на тарифе Premium. Перейдите, чтобы продолжить.',
      ctaText: 'Перейти на Premium',
      ctaHref: '/upgrade',
    };
  }
  // 'free' (or anything else — defensive default to login flow)
  return {
    title: 'Доступно после входа',
    body: 'Видео генерируется бесплатно — нужен только email, чтобы сохранить ваши проекты.',
    ctaText: 'Войти и разблокировать',
    ctaHref: '/login',
  };
}

export function TierGateModal({ state, onClose }: Props) {
  const titleId = useId();
  const bodyId = useId();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const copy = copyForTier(state.required_tier);

  // Escape to close + initial focus on the modal container so the
  // backdrop / body focus is moved into the dialog. Not a full focus
  // trap (NTH per Codex audit) — but covers the keyboard-escape and
  // initial-focus failure modes for a blocking modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keyboard close is handled by the document-level Escape listener in
  // useEffect above. The onKeyDown handlers below exist solely to satisfy
  // biome's useKeyWithClickEvents rule (paired with onClick handlers).
  const onBackdropKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClose();
    }
  };

  return (
    <div
      className="tg-modal-backdrop"
      onClick={onClose}
      onKeyDown={onBackdropKey}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="tg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>{copy.title}</h3>
        <p id={bodyId}>{copy.body}</p>
        <Link href={copy.ctaHref} className="tg-cta">
          {copy.ctaText}
        </Link>
        <button type="button" className="tg-close" onClick={onClose}>
          Не сейчас
        </button>
      </div>
    </div>
  );
}
