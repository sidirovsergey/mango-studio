import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/lib/yookassa-client', () => ({
  createYooKassaPayment: vi.fn(),
}));

import { createYooKassaPayment } from '@/server/lib/yookassa-client';
import { createTopupForAuthedUser } from './topup-core';

/**
 * Targeted tests for the Sub-phase B extract: prove that the helper works
 * when called directly with an externally-provided supabase + user (the
 * verifyOtpAction call path from Sub-phase D). The full ledger/race-condition
 * matrix is already covered through the wrapper in createTopupAction.test.ts;
 * this file just verifies the parametric contract.
 */

const USER = { id: 'user-1', email: 'u@example.com' };
const PROJECT_ID = '00000000-0000-4000-8000-000000000001';

function makeSupabase(opts: {
  intentResult?: {
    data: Array<{
      intent_id: string;
      out_nonce: string;
      out_billing_payment_id: string | null;
      is_new: boolean;
    }> | null;
    error: { code?: string; message: string } | null;
  };
  paymentInsertError?: { code?: string; message: string } | null;
}) {
  const fromImpl = vi.fn(() => ({
    insert: vi.fn().mockResolvedValue({ error: opts.paymentInsertError ?? null }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'bp-1' }, error: null }),
  }));
  const rpcImpl = vi.fn(async (fn: string) => {
    if (fn === 'fn_get_or_create_intent') {
      return opts.intentResult ?? { data: null, error: { message: 'no mock' } };
    }
    return { data: null, error: null };
  });
  // Mimic the supabase-js shape closely enough for `.bind(this)` to work.
  // (The helper does `supabase.from.bind(supabase)`; the mock function is
  // already standalone but bind doesn't break anything.)
  return {
    from: fromImpl,
    rpc: rpcImpl,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'pay_external_1',
    confirmation: { confirmation_url: 'https://yookassa.example/checkout/pay_external_1' },
  });
});

describe('createTopupForAuthedUser — Sub-phase B parametric helper', () => {
  it('does NOT call redirect on any code path (sanity)', async () => {
    // No `next/navigation` mock here — if the helper ever calls redirect(),
    // the import would fail in this test scope (we'd see a different shape
    // of error). The contract is enforced structurally: helper has no
    // `import { redirect }` at all.
    const supabase = makeSupabase({
      intentResult: {
        data: [
          {
            intent_id: 'intent-x',
            out_nonce: 'nonce-x',
            out_billing_payment_id: null,
            is_new: true,
          },
        ],
        error: null,
      },
    });
    const result = await createTopupForAuthedUser({
      supabase: supabase as unknown as Parameters<typeof createTopupForAuthedUser>[0]['supabase'],
      user: USER,
      input: {
        package_code: 'topup_2000',
        intent: { kind: 'render', project_id: PROJECT_ID, return_to: '/p/abc1234567' },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('returns ok + confirmation_url + nonce when intent is fresh', async () => {
    const supabase = makeSupabase({
      intentResult: {
        data: [
          {
            intent_id: 'intent-fresh',
            out_nonce: 'nonce-fresh',
            out_billing_payment_id: null,
            is_new: true,
          },
        ],
        error: null,
      },
    });
    const result = await createTopupForAuthedUser({
      supabase: supabase as unknown as Parameters<typeof createTopupForAuthedUser>[0]['supabase'],
      user: USER,
      input: {
        package_code: 'topup_2000',
        intent: { kind: 'render', project_id: PROJECT_ID, return_to: '/p/abc1234567' },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation_url).toBe('https://yookassa.example/checkout/pay_external_1');
      expect(result.nonce).toBe('nonce-fresh');
      expect(result.payment_id).toBe('pay_external_1');
    }
    expect(createYooKassaPayment).toHaveBeenCalledTimes(1);
  });

  it('surfaces intent RPC error as {ok:false}', async () => {
    const supabase = makeSupabase({
      intentResult: {
        data: null,
        error: { code: 'insufficient_privilege', message: 'project ownership check failed' },
      },
    });
    const result = await createTopupForAuthedUser({
      supabase: supabase as unknown as Parameters<typeof createTopupForAuthedUser>[0]['supabase'],
      user: USER,
      input: {
        package_code: 'topup_2000',
        intent: { kind: 'render', project_id: PROJECT_ID, return_to: '/p/abc1234567' },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('insufficient_privilege');
    }
    expect(createYooKassaPayment).not.toHaveBeenCalled();
  });

  it('link RPC throws after successful payment + insert → still returns ok (Codex SHOULD-FIX)', async () => {
    // Custom supabase mock where fn_link_payment_to_intent THROWS.
    // Codex audit 2026-05-20: previously this would surface as
    // yookassa_error, falsely reporting a failed payment when the user
    // was actually charged. The new finalizeAndLink helper wraps the link
    // in its own try/catch; the outer flow still returns ok.
    const fromImpl = vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'bp-x' }, error: null }),
    }));
    const rpcImpl = vi.fn(async (fn: string) => {
      if (fn === 'fn_get_or_create_intent') {
        return {
          data: [
            {
              intent_id: 'intent-link-fail',
              out_nonce: 'nonce-link-fail',
              out_billing_payment_id: null,
              is_new: true,
            },
          ],
          error: null,
        };
      }
      if (fn === 'fn_link_payment_to_intent') {
        throw new Error('connection reset by peer');
      }
      return { data: null, error: null };
    });
    const supabase = { from: fromImpl, rpc: rpcImpl };

    const result = await createTopupForAuthedUser({
      supabase: supabase as unknown as Parameters<typeof createTopupForAuthedUser>[0]['supabase'],
      user: USER,
      input: {
        package_code: 'topup_2000',
        intent: { kind: 'render', project_id: PROJECT_ID, return_to: '/p/abc1234567' },
      },
    });

    // Payment exists, row was inserted; link failed but non-fatal.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation_url).toBe('https://yookassa.example/checkout/pay_external_1');
      expect(result.payment_id).toBe('pay_external_1');
    }
  });

  it('topup_only path skips the intent ledger entirely', async () => {
    const supabase = makeSupabase({});
    const result = await createTopupForAuthedUser({
      supabase: supabase as unknown as Parameters<typeof createTopupForAuthedUser>[0]['supabase'],
      user: USER,
      input: {
        package_code: 'topup_5000',
        intent: { kind: 'topup_only' },
      },
    });
    expect(result.ok).toBe(true);
    // No call to fn_get_or_create_intent for topup_only.
    expect(supabase.rpc).not.toHaveBeenCalledWith('fn_get_or_create_intent', expect.anything());
  });
});
