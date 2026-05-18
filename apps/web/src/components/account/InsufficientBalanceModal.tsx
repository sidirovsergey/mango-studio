'use client';
import type { MediaJobKind } from '@mango/core';
import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';

export interface InsufficientBalanceState {
  kind: MediaJobKind;
  required_kopeks: number;
  current_kopeks: number;
}

interface Props {
  state: InsufficientBalanceState;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  scene_video: 'генерации видео',
  video: 'генерации видео',
  master_clip: 'итогового видео',
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? `выполнения ${kind}`;
}

function formatRub(kopeks: number): string {
  return `${Math.floor(kopeks / 100).toLocaleString('ru-RU')} ₽`;
}

export function InsufficientBalanceModal({ state, onClose }: Props) {
  const titleId = useId();
  const bodyId = useId();
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Escape to close + initial focus on the modal container so keyboard
  // focus moves into the dialog. Mirrors TierGateModal's approach exactly.
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

  // onKeyDown handlers below exist solely to satisfy biome's
  // useKeyWithClickEvents rule (paired with onClick handlers).
  const onBackdropKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClose();
    }
  };

  const required = formatRub(state.required_kopeks);
  const current = formatRub(state.current_kopeks);
  const label = kindLabel(state.kind);

  return (
    <div
      className="ib-modal-backdrop"
      onClick={onClose}
      onKeyDown={onBackdropKey}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="ib-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="ib-modal-title">
          Недостаточно средств
        </h3>
        <p id={bodyId} className="ib-modal-body">
          Для {label} нужно <span className="ib-modal-numbers">{required}</span>, у вас{' '}
          <span className="ib-modal-numbers">{current}</span>.
        </p>
        <Link href="/upgrade" className="ib-modal-primary">
          Пополнить →
        </Link>
        <button type="button" className="ib-modal-secondary" onClick={onClose}>
          Не сейчас
        </button>
      </div>
    </div>
  );
}
