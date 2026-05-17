import 'server-only';
import { assertCapability, TierGateError, type AccountTier, type MediaJobKind } from '@mango/core';

function isEnforced(): boolean {
  return process.env.AUTH_GATE_ENFORCE === 'true';
}

/**
 * Two-mode capability gate for canary rollout (Phase 1.6 G2).
 *
 * When AUTH_GATE_ENFORCE='true' (post-canary): behaves identically to
 * assertCapability — throws TierGateError on denial.
 *
 * When AUTH_GATE_ENFORCE !== 'true' (canary / default): logs the would-be
 * block via console.warn and lets the call through. This lets us validate
 * getAccountTier reads correctly in prod before any user is actually
 * blocked.
 *
 * Env is read per-call (not module-load) so tests can toggle via
 * vi.stubEnv() between cases.
 */
export function assertCapabilityOrLog(
  tier: AccountTier,
  kind: MediaJobKind,
  modelTier?: 'economy' | 'premium',
): void {
  try {
    assertCapability(tier, kind, modelTier);
  } catch (err) {
    if (err instanceof TierGateError) {
      if (isEnforced()) throw err;
      console.warn('[tier-gate canary]', {
        kind,
        modelTier,
        tier,
        required_tier: err.required_tier,
        would_block: true,
      });
      return;
    }
    throw err;
  }
}
