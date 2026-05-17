import { describe, expect, it, vi } from 'vitest';
import { getAccountTier } from './get-account-tier';

describe('getAccountTier', () => {
  function makeSupabaseMock(tier: string | null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: tier === null ? null : { tier },
              error: null,
            }),
          }),
        }),
      }),
    };
  }

  it("returns the row's tier", async () => {
    const supabase = makeSupabaseMock('free');
    const tier = await getAccountTier(supabase as never, 'user-1');
    expect(tier).toBe('free');
  });

  it('defaults to trial when the row is missing (defensive)', async () => {
    const supabase = makeSupabaseMock(null);
    const tier = await getAccountTier(supabase as never, 'user-1');
    expect(tier).toBe('trial');
  });
});
