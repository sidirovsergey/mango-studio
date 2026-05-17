export type AccountTier = 'trial' | 'free' | 'premium';

// Mirrors apps/web/src/server/lib/scene-helpers.ts MediaJobKind exactly.
// Keep in sync with supabase/migrations/20260512000001 CHECK constraint.
export type MediaJobKind =
  | 'character_dossier'
  | 'character_avatar'
  | 'character_reference'
  | 'character_reference_image'
  | 'first_frame'
  | 'video'
  | 'voice'
  | 'final_clip'
  | 'last_frame_extract'
  | 'scene_first_frame'
  | 'scene_video'
  | 'scene_voice'
  | 'scene_final_clip'
  | 'master_clip'
  | 'storage_mirror';

export class TierGateError extends Error {
  readonly code = 'tier_gate' as const;
  readonly required_tier: AccountTier;
  readonly current_tier: AccountTier;
  readonly kind: MediaJobKind;
  constructor(opts: { required_tier: AccountTier; current_tier: AccountTier; kind: MediaJobKind }) {
    super(`tier_gate: ${opts.kind} requires ${opts.required_tier}, current ${opts.current_tier}`);
    this.name = 'TierGateError';
    this.required_tier = opts.required_tier;
    this.current_tier = opts.current_tier;
    this.kind = opts.kind;
  }
}

export function assertCapability(
  tier: AccountTier,
  kind: MediaJobKind,
  modelTier?: 'economy' | 'premium',
): void {
  // Image kinds — always allowed.
  if (
    kind === 'character_dossier' ||
    kind === 'character_avatar' ||
    kind === 'character_reference' ||
    kind === 'character_reference_image' ||
    kind === 'first_frame' ||
    kind === 'scene_first_frame'
  ) {
    return;
  }

  // Video kinds — tier-gated.
  if (kind === 'video' || kind === 'scene_video') {
    if (tier === 'trial') {
      throw new TierGateError({ required_tier: 'free', current_tier: tier, kind });
    }
    if (tier === 'free' && modelTier === 'premium') {
      throw new TierGateError({ required_tier: 'premium', current_tier: tier, kind });
    }
    return;
  }

  if (kind === 'master_clip') {
    if (tier === 'trial') {
      throw new TierGateError({ required_tier: 'free', current_tier: tier, kind });
    }
    return;
  }

  // Legacy audio kinds — tier gate is N/A (audio rip-out v1.5.0; action layer blocks new entry points).
  if (kind === 'voice' || kind === 'scene_voice' || kind === 'final_clip' || kind === 'scene_final_clip') {
    return;
  }

  // Internal kinds — server-side chain only.
  if (kind === 'last_frame_extract' || kind === 'storage_mirror') {
    return;
  }

  // Exhaustiveness check.
  const _unreachable: never = kind;
  void _unreachable;
}
