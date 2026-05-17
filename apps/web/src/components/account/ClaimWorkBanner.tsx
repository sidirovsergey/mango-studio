import Link from 'next/link';

interface Props {
  projectCount: number;
}

export function ClaimWorkBanner({ projectCount }: Props) {
  return (
    <div className="claim-banner">
      <span>
        У вас {projectCount} {pluralize(projectCount, ['проект', 'проекта', 'проектов'])} в этом
        браузере.
      </span>
      <Link href="/login" className="claim-cta">
        Войдите, чтобы сохранить навсегда и разблокировать видео
      </Link>
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
