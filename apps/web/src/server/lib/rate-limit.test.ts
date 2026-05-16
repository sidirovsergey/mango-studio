import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getServerSupabase } from '@mango/db/server';
import { checkMediaJobQuota } from './rate-limit';

const USER = 'user-abc';

function makeSb(opts: { count: number | null; error?: { message: string } | null }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({
      count: opts.count,
      error: opts.error ?? null,
    }),
  };
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MANGO_RATE_LIMIT_ENABLED = undefined;
  process.env.MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY = undefined;
});

describe('checkMediaJobQuota', () => {
  it('allows when usage under limit', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({ count: 10 }),
    );

    const r = await checkMediaJobQuota(USER);

    expect(r.ok).toBe(true);
    expect(r.used).toBe(10);
    expect(r.limit).toBe(50);
  });

  it('rejects when usage at or above limit', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({ count: 50 }),
    );

    const r = await checkMediaJobQuota(USER);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('50/50');
    }
  });

  it('respects MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY override', async () => {
    process.env.MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY = '5';
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({ count: 5 }),
    );

    const r = await checkMediaJobQuota(USER);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('5/5');
    }
  });

  it('disables entirely when MANGO_RATE_LIMIT_ENABLED=0', async () => {
    process.env.MANGO_RATE_LIMIT_ENABLED = '0';

    const r = await checkMediaJobQuota(USER);

    expect(r.ok).toBe(true);
    expect(getServerSupabase).not.toHaveBeenCalled();
  });

  it('fails open when quota query errors (allow request, warn)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({ count: null, error: { message: 'db unreachable' } }),
    );

    const r = await checkMediaJobQuota(USER);

    expect(r.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('treats null count as 0 usage', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({ count: null }),
    );

    const r = await checkMediaJobQuota(USER);

    expect(r.ok).toBe(true);
    expect(r.used).toBe(0);
  });
});
