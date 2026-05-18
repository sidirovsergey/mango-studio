import { describe, expect, it } from 'vitest';
import { aggregateProjectPrice } from './aggregate';
import type { ModelTier } from './balance';

const scn = (id: string, model_tier: ModelTier) => ({ scene_id: id, model_tier });

describe('aggregateProjectPrice', () => {
  it('4 economy scenes + master = 4×50 + 10 = 210 ₽ (21000 kopeks)', () => {
    const q = aggregateProjectPrice({
      scenes: [
        scn('s1', 'economy'),
        scn('s2', 'economy'),
        scn('s3', 'economy'),
        scn('s4', 'economy'),
      ],
    });
    expect(q.kopeks).toBe(4 * 5000 + 1000);
    expect(q.breakdown.modifiers).toEqual([
      { name: 'scene_video × 4 (economy)', kopeks: 20000 },
      { name: 'master_clip', kopeks: 1000 },
    ]);
  });

  it('mixed tier (2 economy + 2 premium) + master = 2×50 + 2×250 + 10 = 610 ₽', () => {
    const q = aggregateProjectPrice({
      scenes: [
        scn('s1', 'economy'),
        scn('s2', 'premium'),
        scn('s3', 'economy'),
        scn('s4', 'premium'),
      ],
    });
    expect(q.kopeks).toBe(2 * 5000 + 2 * 25000 + 1000);
    // Tier order = first appearance: economy first (s1), premium second (s2).
    expect(q.breakdown.modifiers).toEqual([
      { name: 'scene_video × 2 (economy)', kopeks: 10000 },
      { name: 'scene_video × 2 (premium)', kopeks: 50000 },
      { name: 'master_clip', kopeks: 1000 },
    ]);
  });

  it('withMasterClip:false omits the master_clip line', () => {
    const q = aggregateProjectPrice({
      scenes: [scn('s1', 'economy'), scn('s2', 'economy')],
      withMasterClip: false,
    });
    expect(q.kopeks).toBe(2 * 5000);
    expect(q.breakdown.modifiers.find((m) => m.name === 'master_clip')).toBeUndefined();
  });

  it('empty scenes + withMaster (default true) → just master price', () => {
    const q = aggregateProjectPrice({ scenes: [] });
    expect(q.kopeks).toBe(1000);
    expect(q.breakdown.modifiers).toEqual([{ name: 'master_clip', kopeks: 1000 }]);
  });

  it('empty scenes + withMaster:false → 0 kopeks, empty modifiers', () => {
    const q = aggregateProjectPrice({ scenes: [], withMasterClip: false });
    expect(q.kopeks).toBe(0);
    expect(q.breakdown.modifiers).toEqual([]);
  });

  it('all premium scenes (8 × 250 + 10 = 2010 ₽)', () => {
    const q = aggregateProjectPrice({
      scenes: Array.from({ length: 8 }, (_, i) => scn(`s${i + 1}`, 'premium')),
    });
    expect(q.kopeks).toBe(8 * 25000 + 1000);
    expect(q.breakdown.modifiers).toEqual([
      { name: 'scene_video × 8 (premium)', kopeks: 200000 },
      { name: 'master_clip', kopeks: 1000 },
    ]);
  });

  it('quote model_tier is null (aggregate has no single tier)', () => {
    const q = aggregateProjectPrice({ scenes: [scn('s1', 'economy')] });
    expect(q.model_tier).toBeNull();
  });

  it('output kopeks is integer (no float drift even with many scenes)', () => {
    const q = aggregateProjectPrice({
      scenes: Array.from({ length: 100 }, (_, i) =>
        scn(`s${i}`, i % 2 === 0 ? 'economy' : 'premium'),
      ),
    });
    expect(Number.isInteger(q.kopeks)).toBe(true);
    expect(q.kopeks).toBe(50 * 5000 + 50 * 25000 + 1000);
  });

  it('rejects invalid model_tier at runtime (Codex audit #3)', () => {
    expect(() =>
      aggregateProjectPrice({
        scenes: [{ scene_id: 's1', model_tier: 'banana' as 'economy' }],
      }),
    ).toThrow(/invalid model_tier/);
  });

  it('rejects undefined model_tier at runtime', () => {
    expect(() =>
      aggregateProjectPrice({
        scenes: [{ scene_id: 's1', model_tier: undefined as unknown as 'economy' }],
      }),
    ).toThrow(/invalid model_tier/);
  });
});
