import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MockCheckoutForm } from './MockCheckoutForm';
import './mock-checkout.css';

export const metadata: Metadata = {
  title: 'Оплата · Mango Studio',
  // Don't index — this is an internal acquirer-review surface.
  robots: { index: false, follow: false },
};

// MOCK_YOOKASSA-gated page (see apps/web/src/server/lib/yookassa-client.ts).
// Renders a payment-page-shaped UI for the ЮKassa acquirer approval review
// without making any real payment. Returns 404 unless MOCK_YOOKASSA='true'.
export const dynamic = 'force-dynamic';

export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    return?: string;
    amount?: string;
    description?: string;
  }>;
}) {
  if (process.env.MOCK_YOOKASSA !== 'true') {
    notFound();
  }
  const { id, return: returnUrl, amount, description } = await searchParams;

  // Sanity guard: a malformed link without the params shouldn't half-render.
  if (!id || !returnUrl || !amount) {
    notFound();
  }

  // Refuse anything that doesn't look like our mock — prevents the page
  // from being abused as an open redirector to arbitrary URLs.
  if (!id.startsWith('mock_')) {
    notFound();
  }

  return (
    <main className="mock-checkout-page">
      <div className="mock-checkout-card">
        <header className="mock-checkout-header">
          <div className="mock-checkout-brand">Mango Studio</div>
          <div className="mock-checkout-badge">Тестовый платёж · MOCK</div>
        </header>

        <section className="mock-checkout-amount">
          <p className="mock-checkout-amount-label">К оплате</p>
          <p className="mock-checkout-amount-value">
            {amount} <span>₽</span>
          </p>
          {description && <p className="mock-checkout-amount-description">{description}</p>}
        </section>

        <section className="mock-checkout-form-block">
          <p className="mock-checkout-form-title">Банковская карта</p>
          <MockCheckoutForm paymentId={id} returnUrl={returnUrl} amountRub={amount} />
        </section>

        <footer className="mock-checkout-footer">
          <p>
            Эта страница — внутренняя демонстрация для проверки эквайринга. Реальное списание не
            производится.
          </p>
        </footer>
      </div>
    </main>
  );
}
