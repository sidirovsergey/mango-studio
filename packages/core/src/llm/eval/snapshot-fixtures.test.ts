/**
 * Sanity-parse tests for canonical snapshot fixtures.
 * Verifies every fixture passes schema validation — ensures fixtures stay
 * aligned with SceneSchema / ScriptGenSchema as schemas evolve.
 */

import { describe, expect, it } from 'vitest';
import { SceneSchema, ScriptGenSchema } from '../schemas';
import { CANONICAL_SCENES, CANONICAL_SCRIPTS } from './snapshot-fixtures';

describe('CANONICAL_SCENES', () => {
  it('exports exactly 5 scenes', () => {
    expect(CANONICAL_SCENES).toHaveLength(5);
  });

  it('covers all required labels', () => {
    const labels = CANONICAL_SCENES.map((f) => f.label);
    expect(labels).toContain('quiet');
    expect(labels).toContain('action');
    expect(labels).toContain('dialogue_close_up');
    expect(labels).toContain('wide_environment');
    expect(labels).toContain('multi_character');
  });

  it.each(
    // Create individual test cases from the array
    CANONICAL_SCENES.map((f) => [f.label, f] as const),
  )('scene "%s" parses via SceneSchema', (_label, fixture) => {
    expect(() => SceneSchema.parse(fixture.scene)).not.toThrow();
  });

  it('all scenes have description, description_ru, description_en populated', () => {
    for (const f of CANONICAL_SCENES) {
      expect(f.scene.description.length).toBeGreaterThan(0);
      expect(f.scene.description_ru.length).toBeGreaterThan(0);
      // description_en may be null for legacy compat but spec says populated for Phase-1.4
      expect(f.scene.description_en).not.toBeNull();
      expect((f.scene.description_en as string).length).toBeGreaterThan(0);
    }
  });

  it('all scenes have composition, camera_movement, lighting, audio_direction, arc_role', () => {
    for (const f of CANONICAL_SCENES) {
      expect(f.scene.composition).not.toBeNull();
      expect(f.scene.camera_movement).not.toBeNull();
      expect(f.scene.lighting).not.toBeNull();
      expect(f.scene.audio_direction).not.toBeNull();
      expect(f.scene.arc_role).not.toBeNull();
    }
  });

  it('wide_environment scene has no characters', () => {
    const wide = CANONICAL_SCENES.find((f) => f.label === 'wide_environment');
    expect(wide).toBeDefined();
    expect(wide!.characters).toHaveLength(0);
    expect(wide!.scene.character_ids).toHaveLength(0);
  });

  it('multi_character scene has 2 characters', () => {
    const multi = CANONICAL_SCENES.find((f) => f.label === 'multi_character');
    expect(multi).toBeDefined();
    expect(multi!.characters).toHaveLength(2);
    expect(multi!.scene.character_ids).toHaveLength(2);
  });

  it('dialogue_close_up scene has native audio_mode (English dialogue)', () => {
    const dlg = CANONICAL_SCENES.find((f) => f.label === 'dialogue_close_up');
    expect(dlg).toBeDefined();
    expect(dlg!.scene.audio_mode).toBe('native');
    expect(dlg!.scene.dialogue).not.toBeNull();
  });

  it('multi_character scene has silent_tts (Cyrillic dialogue forces it)', () => {
    const multi = CANONICAL_SCENES.find((f) => f.label === 'multi_character');
    expect(multi).toBeDefined();
    expect(multi!.scene.audio_mode).toBe('silent_tts');
  });

  it('all scenes are deterministic — no Date.now or random in scene_id', () => {
    for (const f of CANONICAL_SCENES) {
      expect(f.scene.scene_id).toMatch(/^canon-/);
    }
  });
});

describe('CANONICAL_SCRIPTS', () => {
  it('exports exactly 2 scripts', () => {
    expect(CANONICAL_SCRIPTS).toHaveLength(2);
  });

  it('covers 15s and 60s labels', () => {
    const labels = CANONICAL_SCRIPTS.map((f) => f.label);
    expect(labels).toContain('15s');
    expect(labels).toContain('60s');
  });

  it.each(CANONICAL_SCRIPTS.map((f) => [f.label, f] as const))(
    'script "%s" parses via ScriptGenSchema',
    (_label, fixture) => {
      expect(() => ScriptGenSchema.parse(fixture.script)).not.toThrow();
    },
  );

  it('15s script has 3 scenes totalling 15s and economy tier', () => {
    const s = CANONICAL_SCRIPTS.find((f) => f.label === '15s');
    expect(s).toBeDefined();
    const totalSec = s!.script.scenes.reduce((acc, sc) => acc + sc.duration_sec, 0);
    expect(totalSec).toBe(15);
    expect(s!.script.tier).toBe('economy');
    expect(s!.script.scenes).toHaveLength(3);
  });

  it('60s script has 8 scenes totalling 60s and premium tier', () => {
    const s = CANONICAL_SCRIPTS.find((f) => f.label === '60s');
    expect(s).toBeDefined();
    const totalSec = s!.script.scenes.reduce((acc, sc) => acc + sc.duration_sec, 0);
    expect(totalSec).toBe(60);
    expect(s!.script.tier).toBe('premium');
    expect(s!.script.scenes).toHaveLength(8);
  });

  it('all scripts have visual_theme with 3-6 palette entries', () => {
    for (const f of CANONICAL_SCRIPTS) {
      expect(f.script.visual_theme).not.toBeNull();
      const palette = f.script.visual_theme!.palette;
      expect(palette.length).toBeGreaterThanOrEqual(3);
      expect(palette.length).toBeLessThanOrEqual(6);
    }
  });

  it('all scripts have narrator_voice', () => {
    for (const f of CANONICAL_SCRIPTS) {
      expect(f.script.narrator_voice).toBeDefined();
      expect(f.script.narrator_voice!.tts_voice_id.length).toBeGreaterThan(0);
    }
  });

  it('60s script arc covers hook→rising→climax→payoff→cta', () => {
    const s = CANONICAL_SCRIPTS.find((f) => f.label === '60s');
    expect(s).toBeDefined();
    const arcs = s!.script.scenes.map((sc) => sc.arc_role);
    expect(arcs).toContain('hook');
    expect(arcs).toContain('rising');
    expect(arcs).toContain('climax');
    expect(arcs).toContain('payoff');
    expect(arcs).toContain('cta');
  });
});
