import { signOutAction } from '@/app/login/actions/signOutAction';
import type { AccountTier } from '@mango/core';
import Link from 'next/link';

interface Props {
  email: string;
  displayName: string | null;
  tier: AccountTier;
  createdAt: string | null;
  projectCount: number;
  balanceKopeks: number;
}

const TIER_COPY: Record<AccountTier, { label: string; sub: string }> = {
  trial: {
    label: 'Trial',
    sub: 'Только персонажи и первые кадры. Пополните баланс, чтобы генерировать видео.',
  },
  free: {
    label: 'Авторизованный',
    sub: 'Видео по балансу: Эконом и Премиум режимы доступны.',
  },
  premium: {
    label: 'Premium',
    sub: 'Все режимы — Seedance, Veo и премиум-генерация.',
  },
};

export function ProfileCard({
  email,
  displayName,
  tier,
  createdAt,
  projectCount,
  balanceKopeks,
}: Props) {
  const tierCopy = TIER_COPY[tier];
  const displayed = displayName?.trim() || email;
  const initial = (displayed.charAt(0) || '?').toUpperCase();

  return (
    <div className="profile-shell">
      <div className="profile-aurora" aria-hidden="true">
        <span className="profile-aurora-blob profile-aurora-blob-a" />
        <span className="profile-aurora-blob profile-aurora-blob-b" />
      </div>

      <main className="profile-page" aria-labelledby="profile-heading">
        <Link href="/" className="profile-back" aria-label="На главную">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M11 7H3m0 0l3.5 3.5M3 7l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          На главную
        </Link>

        <span className="profile-eyebrow">
          <span className="profile-eyebrow-dot" aria-hidden="true" />
          Аккаунт
        </span>

        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">
            {initial}
          </span>
          <div className="profile-identity-text">
            <h1 id="profile-heading" className="profile-name">
              {displayed}
            </h1>
            {displayName && displayName !== email && <span className="profile-email">{email}</span>}
          </div>
        </div>

        <div className={`profile-tier profile-tier-${tier}`}>
          <span className="profile-tier-label">{tierCopy.label}</span>
          <span className="profile-tier-sub">{tierCopy.sub}</span>
        </div>

        <dl className="profile-stats">
          <div className="profile-stat">
            <dt>Проектов</dt>
            <dd>{projectCount}</dd>
          </div>
          <div className="profile-stat">
            <dt>Баланс</dt>
            <dd>{formatRub(balanceKopeks)}</dd>
          </div>
          <div className="profile-stat">
            <dt>С нами с</dt>
            <dd>{formatDate(createdAt)}</dd>
          </div>
        </dl>

        <div className="profile-actions">
          {process.env.NEXT_PUBLIC_PAYMENTS_UI_ENABLED === 'true' && (
            <Link href="/upgrade" className="profile-topup">
              Пополнить
            </Link>
          )}
          <form action={signOutAction}>
            <button type="submit" className="profile-signout">
              Выйти
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function formatRub(kopeks: number): string {
  return `${Math.floor(kopeks / 100).toLocaleString('ru-RU')} ₽`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
