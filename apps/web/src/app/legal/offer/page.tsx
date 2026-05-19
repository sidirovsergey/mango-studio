import type { Metadata } from 'next';
import { LegalLayout, renderLegalDoc } from '../legal-content';

export const metadata: Metadata = {
  title: 'Публичная оферта — Mango Studio',
  description: 'Условия оказания услуг сервиса Mango Studio на mangopro.ru.',
};

// Static at build. The .md source is read at build time; a content edit
// requires a redeploy to pick up — no live file watching in prod.
export const dynamic = 'force-static';

export default async function OfferPage() {
  const html = await renderLegalDoc('offer');
  return <LegalLayout title="Публичная оферта" bodyHtml={html} />;
}
