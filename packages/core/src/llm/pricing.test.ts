import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPricingCacheForTests, calculateCost } from './pricing';

const MOCK_RESPONSE = {
  data: [
    {
      id: 'deepseek/deepseek-chat',
      pricing: { prompt: '0.00000014', completion: '0.00000028' },
    },
    {
      id: 'anthropic/claude-sonnet-4.6',
      pricing: { prompt: '0.000003', completion: '0.000015' },
    },
  ],
};

describe('calculateCost', () => {
  beforeEach(() => {
    __resetPricingCacheForTests();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates cost from live pricing for deepseek-chat', async () => {
    const cost = await calculateCost('deepseek/deepseek-chat', 1000, 500);
    expect(cost).toBeCloseTo(0.00000014 * 1000 + 0.00000028 * 500, 8);
  });

  it('caches the pricing response for 1h', async () => {
    await calculateCost('deepseek/deepseek-chat', 100, 100);
    await calculateCost('anthropic/claude-sonnet-4.6', 100, 100);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when model is unknown (does not throw)', async () => {
    const cost = await calculateCost('unknown/model', 100, 100);
    expect(cost).toBe(0);
  });

  it('returns 0 when fetch fails (does not throw)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    const cost = await calculateCost('deepseek/deepseek-chat', 100, 100);
    expect(cost).toBe(0);
  });

  it('refetches after 1h TTL expires', async () => {
    vi.useFakeTimers();
    try {
      const t0 = new Date('2026-04-27T12:00:00Z').getTime();
      vi.setSystemTime(t0);
      await calculateCost('deepseek/deepseek-chat', 100, 100);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance 61 minutes — past 1h TTL
      vi.setSystemTime(t0 + 61 * 60 * 1000);
      await calculateCost('deepseek/deepseek-chat', 100, 100);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers on next call after a transient fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));

    // First call: fetch rejects; calculateCost returns 0 (no cached entry to fall back to)
    const first = await calculateCost('deepseek/deepseek-chat', 1000, 500);
    expect(first).toBe(0);

    // Second call: fetch succeeds via beforeEach's mockResolvedValue, returns real cost
    const second = await calculateCost('deepseek/deepseek-chat', 1000, 500);
    expect(second).toBeCloseTo(0.00000014 * 1000 + 0.00000028 * 500, 8);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
