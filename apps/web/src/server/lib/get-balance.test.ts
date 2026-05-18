import { describe, expect, it, vi } from 'vitest';
import { getBalance } from './get-balance';

describe('getBalance', () => {
  function makeSupabaseMock(balance: number | null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: balance === null ? null : { balance_kopeks: balance },
              error: null,
            }),
          }),
        }),
      }),
    };
  }

  it("returns the row's balance_kopeks", async () => {
    const supabase = makeSupabaseMock(12500);
    const v = await getBalance(supabase as never, 'user-1');
    expect(v).toBe(12500);
  });

  it('defaults to 0 when the row is missing (defensive)', async () => {
    const supabase = makeSupabaseMock(null);
    const v = await getBalance(supabase as never, 'user-1');
    expect(v).toBe(0);
  });

  it('treats null balance_kopeks as 0', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { balance_kopeks: null },
              error: null,
            }),
          }),
        }),
      }),
    };
    const v = await getBalance(supabase as never, 'user-1');
    expect(v).toBe(0);
  });
});
