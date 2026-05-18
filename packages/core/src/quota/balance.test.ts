import { describe, expect, it } from 'vitest';
import { BalanceGateError, assertBalance, priceKopeks } from './balance';
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
