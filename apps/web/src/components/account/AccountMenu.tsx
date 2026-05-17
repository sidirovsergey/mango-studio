'use client';
import { signOutAction } from '@/app/login/actions/signOutAction';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Props {
  userEmail: string | null;
  isAnonymous: boolean;
  authEnabled: boolean;
}

export function AccountMenu({ userEmail, isAnonymous, authEnabled }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside + Escape — both expected affordances for a menu
  // and required to feel "alive" per Phase 1.6.1 polish brief.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!authEnabled) return null;

  if (isAnonymous || !userEmail) {
    return (
      <Link href="/login" className="account-cta" aria-label="Войти и сохранить">
        <span className="account-cta-dot" aria-hidden="true" />
        <span>Войти</span>
      </Link>
    );
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="account-trigger-avatar" aria-hidden="true">
          {initialOf(userEmail)}
        </span>
        <span className="account-trigger-email">{userEmail}</span>
      </button>
      {open && (
        <div className="account-dropdown">
          {/* Email caption is visual context, not a focusable menu item;
              keep it OUTSIDE the role='menu' container so the menu only
              owns true menuitems (Codex 1.6.2 a11y finding). */}
          <div className="account-dropdown-email" title={userEmail} aria-hidden="true">
            {userEmail}
          </div>
          <div role="menu" aria-label="Меню аккаунта">
            <Link
              href="/profile"
              role="menuitem"
              className="account-dropdown-link"
              onClick={() => setOpen(false)}
            >
              Профиль
            </Link>
            {/* Wrapper form is required by Next.js server-action invocation; we
                suppress the implicit form ARIA role so the menu structure
                (menuitem button) reads cleanly to assistive tech. */}
            <form action={signOutAction} role="presentation">
              <button type="submit" role="menuitem">
                Выйти
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function initialOf(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}
