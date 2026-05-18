import type { MediaJobKind } from './tiers';

export type ModelTier = 'economy' | 'premium';

export interface PriceQuote {
  kopeks: number;
  kind: MediaJobKind;
  model_tier: ModelTier | null;
}

export class BalanceGateError extends Error {
  readonly code = 'insufficient_balance' as const;
  readonly required_kopeks: number;
  readonly current_kopeks: number;
  readonly kind: MediaJobKind;
  constructor(opts: { required_kopeks: number; current_kopeks: number; kind: MediaJobKind }) {
    super(
      `insufficient_balance: ${opts.kind} requires ${opts.required_kopeks} kopeks, have ${opts.current_kopeks}`,
    );
    this.name = 'BalanceGateError';
    this.required_kopeks = opts.required_kopeks;
    this.current_kopeks = opts.current_kopeks;
    this.kind = opts.kind;
  }
}

/**
 * Pure pricing — mirrors fn_price_kopeks() in the DB (keep in sync, parity tested in balance.parity.test.ts).
 */
export function priceKopeks(kind: MediaJobKind, modelTier?: ModelTier): number {
  if (
    kind === 'character_dossier' ||
    kind === 'character_avatar' ||
    kind === 'character_reference' ||
    kind === 'character_reference_image' ||
    kind === 'first_frame' ||
    kind === 'scene_first_frame'
  )
    return 0;
  if (kind === 'last_frame_extract' || kind === 'storage_mirror') return 0;
  if (
    kind === 'voice' ||
    kind === 'scene_voice' ||
    kind === 'final_clip' ||
    kind === 'scene_final_clip'
  )
    return 0;
  if (kind === 'video' || kind === 'scene_video') {
    return modelTier === 'premium' ? 25000 : 5000;
  }
  if (kind === 'master_clip') return 1000;
  const _exhaustive: never = kind;
  void _exhaustive;
  return 0;
}

export function assertBalance(
  balance_kopeks: number,
  kind: MediaJobKind,
  modelTier?: ModelTier,
): void {
  const required = priceKopeks(kind, modelTier);
  if (required <= 0) return;
  if (balance_kopeks < required) {
    throw new BalanceGateError({
      required_kopeks: required,
      current_kopeks: balance_kopeks,
      kind,
    });
  }
}
