import { describe, expect, it } from 'vitest';
import { BalanceGateError, assertBalance, priceKopeks, priceQuote } from './balance';
import type { MediaJobKind } from './tiers';

describe('priceKopeks', () => {
  it('returns 0 for all image kinds', () => {
    for (const k of [
      'character_dossier',
      'character_avatar',
      'character_reference',
      'character_reference_image',
      'first_frame',
      'scene_first_frame',
    ] as MediaJobKind[]) {
      expect(priceKopeks(k)).toBe(0);
      expect(priceKopeks(k, 'economy')).toBe(0);
      expect(priceKopeks(k, 'premium')).toBe(0);
    }
  });

  it('returns 0 for internal + legacy audio kinds', () => {
    for (const k of [
      'last_frame_extract',
      'storage_mirror',
      'voice',
      'scene_voice',
      'final_clip',
      'scene_final_clip',
    ] as MediaJobKind[]) {
      expect(priceKopeks(k)).toBe(0);
    }
  });

  it('charges 5000 kopeks (50 ₽) for economy video', () => {
    expect(priceKopeks('scene_video', 'economy')).toBe(5000);
    expect(priceKopeks('video', 'economy')).toBe(5000);
  });

  it('charges 25000 kopeks (250 ₽) for premium video', () => {
    expect(priceKopeks('scene_video', 'premium')).toBe(25000);
    expect(priceKopeks('video', 'premium')).toBe(25000);
  });

  it('defaults video to economy price when modelTier omitted', () => {
    expect(priceKopeks('scene_video')).toBe(5000);
  });

  it('charges 1000 kopeks (10 ₽) for master_clip', () => {
    expect(priceKopeks('master_clip')).toBe(1000);
  });
});

describe('priceQuote (Phase 1.7.1 extensible signature)', () => {
  const ALL_KINDS: MediaJobKind[] = [
    'character_dossier',
    'character_avatar',
    'character_reference',
    'character_reference_image',
    'first_frame',
    'scene_first_frame',
    'last_frame_extract',
    'storage_mirror',
    'voice',
    'scene_voice',
    'final_clip',
    'scene_final_clip',
    'video',
    'scene_video',
    'master_clip',
  ];

  it('priceQuote.kopeks matches priceKopeks for every (kind, tier) combo', () => {
    for (const k of ALL_KINDS) {
      for (const tier of ['economy', 'premium', undefined] as const) {
        const q = priceQuote({ kind: k, model_tier: tier });
        expect(q.kopeks).toBe(priceKopeks(k, tier));
      }
    }
  });

  it('returns full PriceQuote shape with breakdown', () => {
    const q = priceQuote({ kind: 'scene_video', model_tier: 'premium' });
    expect(q.kopeks).toBe(25000);
    expect(q.kind).toBe('scene_video');
    expect(q.model_tier).toBe('premium');
    expect(q.breakdown.base_kopeks).toBe(25000);
    expect(q.breakdown.modifiers).toEqual([]);
  });

  it('model_tier is null when omitted', () => {
    const q = priceQuote({ kind: 'master_clip' });
    expect(q.model_tier).toBeNull();
    expect(q.kopeks).toBe(1000);
  });

  it('reserved optional fields are accepted but ignored in MVP body', () => {
    const q = priceQuote({
      kind: 'scene_video',
      model_tier: 'economy',
      duration_sec: 10,
      character_count: 3,
      scene_count: 6,
      resolution: 'hd',
    });
    // MVP returns flat economy price; reserved fields had no effect.
    expect(q.kopeks).toBe(5000);
    expect(q.breakdown.modifiers).toEqual([]);
  });

  it('all reserved fields are optional', () => {
    expect(() => priceQuote({ kind: 'master_clip' })).not.toThrow();
    expect(() => priceQuote({ kind: 'scene_video', model_tier: 'economy' })).not.toThrow();
  });
});

describe('assertBalance', () => {
  it('passes for free kinds regardless of balance', () => {
    expect(() => assertBalance(0, 'character_avatar')).not.toThrow();
    expect(() => assertBalance(0, 'first_frame')).not.toThrow();
  });

  it('passes when balance >= required', () => {
    expect(() => assertBalance(5000, 'scene_video', 'economy')).not.toThrow();
    expect(() => assertBalance(25000, 'scene_video', 'premium')).not.toThrow();
  });

  it('throws BalanceGateError when balance < required', () => {
    expect(() => assertBalance(4999, 'scene_video', 'economy')).toThrow(BalanceGateError);
    expect(() => assertBalance(999, 'master_clip')).toThrow(BalanceGateError);
  });

  it('BalanceGateError carries required_kopeks, current_kopeks, kind', () => {
    try {
      assertBalance(100, 'scene_video', 'premium');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BalanceGateError);
      const e = err as BalanceGateError;
      expect(e.code).toBe('insufficient_balance');
      expect(e.required_kopeks).toBe(25000);
      expect(e.current_kopeks).toBe(100);
      expect(e.kind).toBe('scene_video');
    }
  });
});
