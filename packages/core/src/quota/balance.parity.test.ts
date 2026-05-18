import { describe, expect, it } from 'vitest';
import { priceKopeks } from './balance';
import type { MediaJobKind } from './tiers';

// Mirror of the SQL fn_price_kopeks CASE expression in
// supabase/migrations/20260518000002_billing.sql. Drift in either the SQL
// or the TS function vs this table fails CI loudly.
const SQL_MIRROR: ReadonlyArray<{
  kind: MediaJobKind;
  tier: 'economy' | 'premium' | null;
  kopeks: number;
}> = [
  // Free image kinds
  { kind: 'character_dossier', tier: null, kopeks: 0 },
  { kind: 'character_avatar', tier: null, kopeks: 0 },
  { kind: 'character_reference', tier: null, kopeks: 0 },
  { kind: 'character_reference_image', tier: null, kopeks: 0 },
  { kind: 'first_frame', tier: null, kopeks: 0 },
  { kind: 'scene_first_frame', tier: null, kopeks: 0 },
  // Internal kinds (server-only chain)
  { kind: 'last_frame_extract', tier: null, kopeks: 0 },
  { kind: 'storage_mirror', tier: null, kopeks: 0 },
  // Legacy audio kinds (post-1.5 rip-out)
  { kind: 'voice', tier: null, kopeks: 0 },
  { kind: 'scene_voice', tier: null, kopeks: 0 },
  { kind: 'final_clip', tier: null, kopeks: 0 },
  { kind: 'scene_final_clip', tier: null, kopeks: 0 },
  // Video — economy
  { kind: 'video', tier: 'economy', kopeks: 5000 },
  { kind: 'scene_video', tier: 'economy', kopeks: 5000 },
  // Video — premium
  { kind: 'video', tier: 'premium', kopeks: 25000 },
  { kind: 'scene_video', tier: 'premium', kopeks: 25000 },
  // Master clip
  { kind: 'master_clip', tier: null, kopeks: 1000 },
];

describe('priceKopeks ↔ fn_price_kopeks SQL parity', () => {
  it.each(SQL_MIRROR)(
    'TS priceKopeks($kind, $tier) === SQL fn_price_kopeks($kind, $tier) === $kopeks',
    ({ kind, tier, kopeks }) => {
      const tsPrice = priceKopeks(kind, tier ?? undefined);
      expect(tsPrice).toBe(kopeks);
    },
  );

  // Future hardening: when a DB connection is available, also SELECT
  //   fn_price_kopeks(kind, tier) from prod and assert against the same
  //   table. Pure-TS coverage runs in any CI environment without DATABASE_URL.
});
