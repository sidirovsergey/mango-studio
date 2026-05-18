import { BalanceGateError } from '@mango/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertBalanceOrLog } from './assert-balance-or-log';

describe('assertBalanceOrLog', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('throws BalanceGateError when PAYMENTS_GATE_ENFORCE=true and balance insufficient', () => {
    vi.stubEnv('PAYMENTS_GATE_ENFORCE', 'true');
    expect(() => assertBalanceOrLog(100, 'scene_video', 'economy')).toThrow(BalanceGateError);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs and returns when PAYMENTS_GATE_ENFORCE!=true (canary mode)', () => {
    vi.stubEnv('PAYMENTS_GATE_ENFORCE', 'false');
    expect(() => assertBalanceOrLog(100, 'scene_video', 'economy')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      '[balance-gate canary]',
      expect.objectContaining({ kind: 'scene_video', current_kopeks: 100, required_kopeks: 5000 }),
    );
  });

  it('passes through silently when balance sufficient (any env)', () => {
    vi.stubEnv('PAYMENTS_GATE_ENFORCE', 'false');
    expect(() => assertBalanceOrLog(5000, 'scene_video', 'economy')).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes through silently for free kinds (any env)', () => {
    vi.stubEnv('PAYMENTS_GATE_ENFORCE', 'true');
    expect(() => assertBalanceOrLog(0, 'character_avatar')).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
