import 'server-only';
import { BalanceGateError, type MediaJobKind, assertBalance } from '@mango/core';

function isEnforced(): boolean {
  return process.env.PAYMENTS_GATE_ENFORCE === 'true';
}

/**
 * Two-mode balance gate for canary rollout (Phase 1.7 D1). Mirrors
 * assert-capability-or-log.ts from v1.6 G2.
 *
 * When PAYMENTS_GATE_ENFORCE='true' (post-canary): identical to assertBalance
 * — throws BalanceGateError on insufficient balance.
 *
 * When PAYMENTS_GATE_ENFORCE !== 'true' (canary / default): logs the
 * would-be block via console.warn and lets the call through. Validates
 * getBalance reads correctly in prod before any user is actually blocked.
 *
 * Env read per-call (not module-load) so vi.stubEnv works in tests.
 */
export function assertBalanceOrLog(
  balance_kopeks: number,
  kind: MediaJobKind,
  modelTier?: 'economy' | 'premium',
): void {
  try {
    assertBalance(balance_kopeks, kind, modelTier);
  } catch (err) {
    if (err instanceof BalanceGateError) {
      if (isEnforced()) throw err;
      console.warn('[balance-gate canary]', {
        kind,
        modelTier,
        current_kopeks: err.current_kopeks,
        required_kopeks: err.required_kopeks,
        would_block: true,
      });
      return;
    }
    throw err;
  }
}
