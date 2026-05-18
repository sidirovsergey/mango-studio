import type { MediaJobKind } from './tiers';

export type ModelTier = 'economy' | 'premium';

/**
 * Phase 1.7.1: extensible pricing input.
 *
 * MVP body uses only {kind, model_tier} (flat per-kind × tier matrix). Optional
 * fields (duration_sec, character_count, scene_count, resolution) are RESERVED
 * for CJM §6.3 granular pricing in a future minor patch. Adding them to the
 * type now opens the call sites; the function body picks them up later without
 * breaking existing callers.
 */
export interface PriceQuoteInput {
  kind: MediaJobKind;
  model_tier?: ModelTier;
  /** Reserved — future per-second pricing. */
  duration_sec?: number;
  /** Reserved — future per-character-lock pricing. */
  character_count?: number;
  /** Reserved — future bundle discount math. */
  scene_count?: number;
  /** Reserved — future resolution upcharge ('sd'|'hd'|'4k'). */
  resolution?: 'sd' | 'hd' | '4k';
}

export interface PriceBreakdown {
  base_kopeks: number;
  modifiers: Array<{ name: string; kopeks: number }>;
}

export interface PriceQuote {
  kopeks: number;
  kind: MediaJobKind;
  model_tier: ModelTier | null;
  breakdown: PriceBreakdown;
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
 * Internal flat-pricing matrix. Mirrors fn_price_kopeks() in the DB (parity
 * tested in balance.parity.test.ts).
 */
function flatPriceKopeks(kind: MediaJobKind, modelTier?: ModelTier): number {
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

/**
 * Structured price quote — open extension surface for CJM §6.3 granular
 * pricing. MVP body ignores all optional fields and returns the flat
 * per-kind × tier price; future revisions multiply or add line items
 * to `breakdown.modifiers`.
 *
 * Always returns kopeks as integer.
 */
export function priceQuote(input: PriceQuoteInput): PriceQuote {
  const base = flatPriceKopeks(input.kind, input.model_tier);
  return {
    kopeks: base,
    kind: input.kind,
    model_tier: input.model_tier ?? null,
    breakdown: {
      base_kopeks: base,
      modifiers: [],
    },
  };
}

/**
 * Number-returning convenience wrapper for callers that only need the
 * total. Mirrors fn_price_kopeks() in the DB. Behavior identical to v1.7.0.
 */
export function priceKopeks(kind: MediaJobKind, modelTier?: ModelTier): number {
  return priceQuote({ kind, model_tier: modelTier }).kopeks;
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
