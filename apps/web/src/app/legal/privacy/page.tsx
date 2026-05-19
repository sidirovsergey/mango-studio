import type { Metadata } from 'next';
import { LegalLayout, renderLegalDoc } from '../legal-content';

export const metadata: Metadata = {
  title: 'Политика конфиденциальности — Mango Studio',
  description: 'Порядок обработки и защиты персональных данных пользователей сайта mangopro.ru.',
};

// Static at build. The .md source is read at build time; a content edit
// requires a redeploy to pick up — no live file watching in prod.
export const dynamic = 'force-static';

export default async function PrivacyPage() {
  const html = await renderLegalDoc('privacy');
  return <LegalLayout title="Политика конфиденциальности" bodyHtml={html} />;
}
