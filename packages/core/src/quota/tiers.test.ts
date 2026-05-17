import { describe, expect, it } from 'vitest';
import type { MediaJobKind } from './tiers';
import { TierGateError, assertCapability } from './tiers';

describe('assertCapability — capability matrix', () => {
  const allKinds: MediaJobKind[] = [
    'character_dossier',
    'character_avatar',
    'character_reference',
    'character_reference_image',
    'first_frame',
    'scene_first_frame',
    'video',
    'scene_video',
    'master_clip',
    'voice',
    'scene_voice',
    'final_clip',
    'scene_final_clip',
    'last_frame_extract',
    'storage_mirror',
  ];

  it('trial allows all character image kinds', () => {
    for (const k of [
      'character_dossier',
      'character_avatar',
      'character_reference',
      'character_reference_image',
    ] as MediaJobKind[]) {
      expect(() => assertCapability('trial', k)).not.toThrow();
    }
  });

  it('trial allows first-frame kinds (image)', () => {
    expect(() => assertCapability('trial', 'first_frame')).not.toThrow();
    expect(() => assertCapability('trial', 'scene_first_frame')).not.toThrow();
  });

  it('trial BLOCKS video kinds', () => {
    for (const k of ['video', 'scene_video', 'master_clip'] as MediaJobKind[]) {
      expect(() => assertCapability('trial', k)).toThrow(TierGateError);
    }
  });

  it('free allows video kinds with economy model', () => {
    expect(() => assertCapability('free', 'scene_video', 'economy')).not.toThrow();
    expect(() => assertCapability('free', 'master_clip')).not.toThrow();
  });

  it('free BLOCKS premium-model video', () => {
    expect(() => assertCapability('free', 'scene_video', 'premium')).toThrow(TierGateError);
  });

  it('premium allows everything user-callable', () => {
    expect(() => assertCapability('premium', 'scene_video', 'premium')).not.toThrow();
  });

  it('legacy audio kinds are tier-N/A (gate returns without throw — action layer blocks them)', () => {
    for (const k of ['voice', 'scene_voice', 'final_clip', 'scene_final_clip'] as MediaJobKind[]) {
      expect(() => assertCapability('trial', k)).not.toThrow();
      expect(() => assertCapability('free', k)).not.toThrow();
    }
  });

  it('internal kinds (last_frame_extract, storage_mirror) bypass the gate', () => {
    expect(() => assertCapability('trial', 'last_frame_extract')).not.toThrow();
    expect(() => assertCapability('trial', 'storage_mirror')).not.toThrow();
  });

  it('TierGateError carries required_tier + current_tier + kind', () => {
    try {
      assertCapability('trial', 'scene_video');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TierGateError);
      const e = err as TierGateError;
      expect(e.code).toBe('tier_gate');
      expect(e.current_tier).toBe('trial');
      expect(e.required_tier).toBe('free');
      expect(e.kind).toBe('scene_video');
    }
  });

  it('every MediaJobKind has a defined capability decision', () => {
    for (const k of allKinds) {
      const decisions = [
        () => assertCapability('trial', k),
        () => assertCapability('free', k, 'economy'),
        () => assertCapability('premium', k, 'premium'),
      ];
      for (const fn of decisions) {
        try {
          fn();
        } catch (e) {
          if (!(e instanceof TierGateError)) throw e;
        }
      }
    }
  });
});
