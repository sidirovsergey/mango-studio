import { TopupCard } from '@/components/account/TopupCard';
import { getBalance } from '@/server/lib/get-balance';
import { getServerSupabase } from '@mango/db/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PACKAGES = [
  { code: 'topup_2000' as const, rub: 2000, eco: 40, premium: 8 },
  { code: 'topup_5000' as const, rub: 5000, eco: 100, premium: 20 },
  { code: 'topup_10000' as const, rub: 10000, eco: 200, premium: 40 },
];

function formatRub(kopeks: number): string {
  return `${Math.floor(kopeks / 100).toLocaleString('ru-RU')} ₽`;
}

export default async function UpgradePage() {
  // Master switch: if payments UI flag is off, treat as 404
  if (process.env.NEXT_PUBLIC_PAYMENTS_UI_ENABLED !== 'true') {
    notFound();
  }

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user || user.is_anonymous || !user.email) {
    redirect('/login');
  }

  const balance = await getBalance(supabase, user.id);

  return (
    <main className="upgrade-shell" aria-labelledby="upgrade-heading">
      <div className="upgrade-aurora" aria-hidden="true">
        <span className="upgrade-aurora-blob upgrade-aurora-blob-a" />
        <span className="upgrade-aurora-blob upgrade-aurora-blob-b" />
      </div>
      <div className="upgrade-content">
        <Link href="/" className="upgrade-back">
          ← На главную
        </Link>
        <h1 id="upgrade-heading" className="upgrade-title">
          Пополнить баланс
        </h1>
        <p className="upgrade-balance">
          Сейчас у вас: <span className="upgrade-balance-value">{formatRub(balance)}</span>
        </p>
        <ul className="topup-grid" aria-label="Пакеты пополнения">
          {PACKAGES.map((pkg) => (
            <li key={pkg.code}>
              <TopupCard
                code={pkg.code}
                rub={pkg.rub}
                ecoCount={pkg.eco}
                premiumCount={pkg.premium}
              />
            </li>
          ))}
        </ul>
        <p className="upgrade-disclaimer">Платежи через ЮKassa. Российские карты + СБП.</p>
      </div>
    </main>
  );
}
