import { TierGateError } from '@mango/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCapabilityOrLog } from './assert-capability-or-log';

describe('assertCapabilityOrLog', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('throws TierGateError when AUTH_GATE_ENFORCE=true and capability denied', () => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'true');
    expect(() => assertCapabilityOrLog('trial', 'scene_video')).toThrow(TierGateError);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs and returns when AUTH_GATE_ENFORCE!=true and capability denied (canary mode)', () => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'false');
    expect(() => assertCapabilityOrLog('trial', 'scene_video')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      '[tier-gate canary]',
      expect.objectContaining({ kind: 'scene_video', tier: 'trial', would_block: true }),
    );
  });

  it('passes through silently when capability is allowed (any env)', () => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'false');
    expect(() => assertCapabilityOrLog('free', 'scene_video', 'economy')).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes through silently when capability is allowed (enforce mode)', () => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'true');
    expect(() => assertCapabilityOrLog('free', 'scene_video', 'economy')).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Note: assertCapability does not throw any non-TierGateError errors in
  // practice (every MediaJobKind is handled via the exhaustiveness check, and
  // no other error sources exist in that function). A non-TierGate rethrow test
  // would require injecting an artificial throw path that doesn't exist in the
  // real implementation, making it a synthetic fiction rather than a useful
  // regression guard. The defense-in-depth `throw err` path for unrelated errors
  // is present in the implementation but skipped here for this reason.
});
