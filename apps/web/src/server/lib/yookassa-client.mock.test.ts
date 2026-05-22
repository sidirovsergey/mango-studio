import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createYooKassaPayment } from './yookassa-client';

/**
 * Tests for the MOCK_YOOKASSA env toggle in createYooKassaPayment. The real
 * branch is exercised indirectly via the createTopupAction test suite with
 * stubbed shop_id/secret + mocked fetch — those tests stay intact.
 */
const baseInput = {
  amount_kopeks: 210_00,
  description: 'Mango Studio — пополнение баланса на 210 ₽',
  return_url: 'https://mangopro.ru/p/abc1234567?nonce=NONCE_TEST',
  metadata: { user_id: 'u1', package_code: 'topup_2000' },
  customer_email: 'u@example.com',
  idempotence_key: 'topup-intent:intent-1',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('yookassa-client — MOCK_YOOKASSA toggle', () => {
  beforeEach(() => {
    vi.stubEnv('MOCK_YOOKASSA', 'true');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test.example');
    // Stub the real branch's env so a failure mode would be observable
    // (we want to PROVE we never hit it).
    vi.stubEnv('YOOKASSA_SHOP_ID', '');
    vi.stubEnv('YOOKASSA_SECRET_KEY', '');
  });

  it('returns a ЮKassa-shaped mock payment without calling fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('real fetch should not be called when MOCK_YOOKASSA=true'));

    const payment = await createYooKassaPayment(baseInput);

    expect(payment.id).toBe('mock_topup-intent:intent-1');
    expect(payment.status).toBe('pending');
    expect(payment.amount).toEqual({ value: '210.00', currency: 'RUB' });
    expect(payment.confirmation.type).toBe('redirect');
    expect(payment.confirmation.confirmation_url).toMatch(
      /^https:\/\/test\.example\/mock-checkout\?/,
    );
    expect(payment.metadata).toEqual(baseInput.metadata);

    // confirmation_url must include the real return_url encoded.
    const u = new URL(payment.confirmation.confirmation_url);
    expect(u.searchParams.get('id')).toBe('mock_topup-intent:intent-1');
    expect(u.searchParams.get('return')).toBe(baseInput.return_url);
    expect(u.searchParams.get('amount')).toBe('210.00');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT throw when YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY are missing (mock branch short-circuits)', async () => {
    // Already stubbed empty above. The real branch would throw — mock must
    // win the early return.
    await expect(createYooKassaPayment(baseInput)).resolves.toBeDefined();
  });
});

describe('yookassa-client — MOCK_YOOKASSA off', () => {
  it('falls through to real branch when env unset, hitting the shop_id guard', async () => {
    vi.stubEnv('MOCK_YOOKASSA', '');
    vi.stubEnv('YOOKASSA_SHOP_ID', '');
    vi.stubEnv('YOOKASSA_SECRET_KEY', '');
    await expect(createYooKassaPayment(baseInput)).rejects.toThrow(
      /YOOKASSA_SHOP_ID not configured/,
    );
  });

  it('treats values other than exactly "true" as off', async () => {
    vi.stubEnv('MOCK_YOOKASSA', '1');
    vi.stubEnv('YOOKASSA_SHOP_ID', '');
    vi.stubEnv('YOOKASSA_SECRET_KEY', '');
    await expect(createYooKassaPayment(baseInput)).rejects.toThrow(
      /YOOKASSA_SHOP_ID not configured/,
    );
  });

  // Operator typo lockdown (Codex NIT 2026-05-20): uppercase forms should
  // also NOT activate the mock. Conservative default per Codex: typos stay
  // off rather than fall into mock mode.
  it.each([['True'], ['TRUE'], ['yes'], [' true '], ['true ']])(
    'treats %s as off (operator typo lockdown)',
    async (val) => {
      vi.stubEnv('MOCK_YOOKASSA', val);
      vi.stubEnv('YOOKASSA_SHOP_ID', '');
      vi.stubEnv('YOOKASSA_SECRET_KEY', '');
      await expect(createYooKassaPayment(baseInput)).rejects.toThrow(
        /YOOKASSA_SHOP_ID not configured/,
      );
    },
  );
});
