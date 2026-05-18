import Link from 'next/link';

interface Props {
  projectCount: number;
}

export function ClaimWorkBanner({ projectCount }: Props) {
  const noun = pluralize(projectCount, ['проект', 'проекта', 'проектов']);
  return (
    <aside className="claim-banner" aria-label="Сохранить работу">
      <div className="claim-banner-meta">
        <span className="claim-banner-eyebrow">Сохранить работу</span>
        <span className="claim-banner-body">
          Пополните баланс, чтобы создавать видео из{' '}
          <span className="claim-banner-count">
            {projectCount} {noun}
          </span>
        </span>
      </div>
      <Link href="/login" className="claim-banner-cta">
        Войти и пополнить баланс
        <svg
          className="claim-banner-arrow"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </aside>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
