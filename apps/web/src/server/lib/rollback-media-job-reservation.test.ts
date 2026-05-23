import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getServerSupabase } from '@mango/db/server';
import { rollbackMediaJobReservation } from './scene-helpers';

/**
 * Builds a Supabase mock that exposes `.from('media_jobs').update(...)
 * .eq('id', ...).eq('status', 'reserved')` as a recordable terminal awaitable.
 */
function makeSb(opts: { updateError?: { message: string } | null } = {}) {
  const finalEq = vi.fn().mockResolvedValue({ error: opts.updateError ?? null });
  const firstEq = vi.fn(() => ({ eq: finalEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const deleteFn = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({}) })) }));
  const sb = {
    from: vi.fn(() => ({
      update,
      delete: deleteFn,
    })),
  };
  return { sb, update, firstEq, finalEq, deleteFn };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rollbackMediaJobReservation', () => {
  it('UPDATEs status to cancelled (NOT DELETE) — refund-safe per Codex PR #54 audit', async () => {
    const { sb, update, deleteFn, firstEq, finalEq } = makeSb();
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    await rollbackMediaJobReservation('job-fail');

    // The refund-safety contract: must UPDATE status='cancelled', not DELETE.
    // DELETE would CASCADE billing_charges away without firing
    // fn_refund_reservation, debiting the user without refund.
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(deleteFn).not.toHaveBeenCalled();
    // Status guard: only flip rows still in 'reserved' — prevents racing
    // a concurrent finalize that flipped the row to 'pending'.
    expect(firstEq).toHaveBeenCalledWith('id', 'job-fail');
    expect(finalEq).toHaveBeenCalledWith('status', 'reserved');
  });

  it('no-ops on empty job_id (defensive guard)', async () => {
    const { sb, update } = makeSb();
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    await rollbackMediaJobReservation('');
    expect(update).not.toHaveBeenCalled();
    expect(getServerSupabase).not.toHaveBeenCalled();
  });

  it('logs but does not throw when the UPDATE itself errors', async () => {
    const { sb } = makeSb({ updateError: { message: 'db hiccup' } });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(rollbackMediaJobReservation('job-x')).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      '[rollbackMediaJobReservation] cleanup failed',
      expect.objectContaining({ job_id: 'job-x', error: 'db hiccup' }),
    );

    warnSpy.mockRestore();
  });
});
