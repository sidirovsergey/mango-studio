'use client';
import { signOutAction } from '@/app/login/actions/signOutAction';
import Link from 'next/link';
import { useState } from 'react';

interface Props {
  userEmail: string | null;
  isAnonymous: boolean;
  authEnabled: boolean;
}

export function AccountMenu({ userEmail, isAnonymous, authEnabled }: Props) {
  const [open, setOpen] = useState(false);

  if (!authEnabled) return null;

  if (isAnonymous || !userEmail) {
    return (
      <Link href="/login" className="account-cta">
        Войти / Сохранить
      </Link>
    );
  }

  return (
    <div className="account-menu">
      <button type="button" className="account-trigger" onClick={() => setOpen((o) => !o)}>
        {userEmail}
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <form action={signOutAction}>
            <button type="submit">Выйти</button>
          </form>
        </div>
      )}
    </div>
  );
}
