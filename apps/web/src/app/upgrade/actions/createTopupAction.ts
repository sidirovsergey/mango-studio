'use server';

import { createYooKassaPayment } from '@/server/lib/yookassa-client';
import { getServerSupabase } from '@mango/db/server';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const InputSchema = z.object({
  package_code: z.enum(['topup_2000', 'topup_5000', 'topup_10000']),
});

type PackageCode = z.infer<typeof InputSchema>['package_code'];

const PACKAGE_KOPEKS: Record<PackageCode, number> = {
  topup_2000: 200_000,
  topup_5000: 500_000,
  topup_10000: 1_000_000,
};

export type CreateTopupResult =
  | { ok: true; confirmation_url: string; payment_id: string }
  | { ok: false; error: { code: string; message: string } };

export async function createTopupAction(input: unknown): Promise<CreateTopupResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_package', message: 'Неверный пакет.' } };
  }

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || user.is_anonymous || !user.email) {
    redirect('/login');
  }
  // After redirect(), TypeScript still sees user as possibly anon — narrow:
  const authedUser = user as { id: string; email: string };

  const amount_kopeks = PACKAGE_KOPEKS[parsed.data.package_code];
  // Deterministic Idempotence-Key (60s window per user+package) — double-click
  // within 60s collapses to one ЮKassa payment intent.
  const minute = Math.floor(Date.now() / 60_000);
  const idempotence_key = `topup:${authedUser.id}:${parsed.data.package_code}:${minute}`;
  const amount_rub = amount_kopeks / 100;

  try {
    const payment = await createYooKassaPayment({
      amount_kopeks,
      description: `Mango Studio — пополнение баланса на ${amount_rub} ₽`,
      return_url: 'https://mangopro.ru/profile?topup=pending',
      metadata: { user_id: authedUser.id, package_code: parsed.data.package_code },
      customer_email: authedUser.email,
      idempotence_key,
    });

    // Record locally for webhook lookup (Codex BLOCKER #4 fix).
    // billing_payments is not yet in generated Supabase types (migration added in Phase 1.7);
    // cast through unknown to bypass the overload constraint until `supabase gen types` is re-run.
    const billingFrom = supabase.from as unknown as (table: string) => {
      insert: (
        row: Record<string, unknown>,
      ) => Promise<{ error: { code: string; message: string } | null }>;
    };
    const { error: insertError } = await billingFrom('billing_payments').insert({
      user_id: authedUser.id,
      provider_payment_id: payment.id,
      amount_kopeks,
      currency: 'RUB',
      status: 'pending',
      package_code: parsed.data.package_code,
      metadata: payment as unknown as Record<string, unknown>,
    });
    if (insertError) {
      // Idempotent retry: 23505 = UNIQUE violation → payment already recorded.
      if (insertError.code !== '23505') {
        return {
          ok: false,
          error: { code: insertError.code ?? 'db_error', message: insertError.message },
        };
      }
    }

    return {
      ok: true,
      confirmation_url: payment.confirmation.confirmation_url,
      payment_id: payment.id,
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'yookassa_error',
        message: err instanceof Error ? err.message : 'Не удалось создать платёж.',
      },
    };
  }
}
