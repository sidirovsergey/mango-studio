import { type ModelTier, type PriceQuote, priceQuote } from './balance';
import type { MediaJobKind } from './tiers';

/**
 * Phase 1.7.1 — aggregate price for the storyboard sticky-CTA («Получить
 * готовый ролик — XXX ₽»).
 *
 * Sums per-scene `scene_video` cost (each scene's own tier) + optional
 * `master_clip`. Native audio (Veo 3.1 embedded) — no audio line item;
 * PO confirmed 2026-05-18 ElevenLabs/OpenAI TTS overridden out.
 *
 * Codex audit 2026-05-18 surfaced: scene-tier mix (some economy + some
 * premium), master_clip optional flag, regen exclusion. Signature reflects
 * each.
 */

export interface AggregateSceneSpec {
  scene_id: string;
  model_tier: ModelTier;
}

export interface AggregatePriceInput {
  scenes: AggregateSceneSpec[];
  /**
   * Default true — required for delivery. Pass false to quote the «scenes
   * only» price (e.g. for a regen-without-final-master scenario).
   */
  withMasterClip?: boolean;
}

/**
 * Returns the total kopeks + a breakdown grouping scenes by tier. Regens
 * are NOT included — they're user-initiated post-payment line items and
 * priced at per-call `priceQuote({ kind: 'scene_video', model_tier })`.
 */
const VALID_TIERS: readonly ModelTier[] = ['economy', 'premium'];

export function aggregateProjectPrice(input: AggregatePriceInput): PriceQuote {
  const withMaster = input.withMasterClip ?? true;
  const modifiers: PriceQuote['breakdown']['modifiers'] = [];
  let total = 0;

  // Codex audit 2026-05-18 #3 — runtime tier validation. TS callers are safe,
  // but if input crosses a trust boundary (DB column, server action body,
  // RSC URL params) an unknown string like 'banana' would silently price
  // as economy in flatPriceKopeks. Reject loud.
  for (const s of input.scenes) {
    if (!VALID_TIERS.includes(s.model_tier)) {
      throw new Error(
        `aggregateProjectPrice: invalid model_tier '${String(s.model_tier)}' for scene ${s.scene_id}`,
      );
    }
  }

  // Stable grouping order: scenes appear by tier insertion order, then
  // master_clip. Tier order = first appearance in input.scenes (deterministic).
  const byTier = new Map<ModelTier, number>();
  for (const s of input.scenes) {
    byTier.set(s.model_tier, (byTier.get(s.model_tier) ?? 0) + 1);
  }

  for (const [tier, count] of byTier) {
    const per = priceQuote({ kind: 'scene_video', model_tier: tier }).kopeks;
    const line = per * count;
    modifiers.push({
      name: `scene_video × ${count} (${tier})`,
      kopeks: line,
    });
    total += line;
  }

  if (withMaster) {
    const master = priceQuote({ kind: 'master_clip' }).kopeks;
    modifiers.push({ name: 'master_clip', kopeks: master });
    total += master;
  }

  return {
    kopeks: total,
    // Codex audit 2026-05-18 #4 — kind is a SYNTHETIC value here, not a real
    // media-job kind. Consumers MUST treat aggregate quotes as project-level
    // totals; the kind field is set to master_clip purely to satisfy the
    // discriminated-union return type and SHOULD NOT be inspected. If a future
    // consumer needs to narrow on aggregate vs single-job quotes, introduce a
    // separate AggregatePriceQuote type rather than overloading PriceQuote.kind.
    kind: 'master_clip' as MediaJobKind,
    model_tier: null,
    breakdown: { base_kopeks: 0, modifiers },
  };
}
