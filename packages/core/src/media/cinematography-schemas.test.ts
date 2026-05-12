import { describe, expect, it } from 'vitest';
import {
  ArcRoleSchema,
  CameraAngleSchema,
  CameraMovementKindSchema,
  CompositionSchema,
  ShotSizeSchema,
  VisualThemeSchema,
} from './cinematography-schemas';

describe('cinematography-schemas', () => {
  it('parses a valid Composition', () => {
    const parsed = CompositionSchema.parse({
      shot_size: 'medium_close_up',
      angle: 'eye_level',
      framing_notes: 'subject left third',
      subject_focus: 'c1',
    });
    expect(parsed.shot_size).toBe('medium_close_up');
  });

  it('rejects invalid shot_size', () => {
    expect(() => CompositionSchema.parse({ shot_size: 'mega_huge', angle: 'eye_level' })).toThrow();
  });

  // Regression: Grok 4.1 Fast emits cinematography vocabulary outside our
  // canonical enums (medium_wide, push_in, closeup, etc.). Schema-boundary
  // coercion must alias these to canonical values without losing semantics.
  describe('LLM-output enum coercion', () => {
    it('coerces shot_size synonyms (medium_wide → wide)', () => {
      expect(ShotSizeSchema.parse('medium_wide')).toBe('wide');
      expect(ShotSizeSchema.parse('medium_long')).toBe('wide');
      expect(ShotSizeSchema.parse('long_shot')).toBe('wide');
      expect(ShotSizeSchema.parse('extreme_long')).toBe('extreme_wide');
    });

    it('coerces shot_size punctuation variants (closeup → close_up)', () => {
      expect(ShotSizeSchema.parse('closeup')).toBe('close_up');
      expect(ShotSizeSchema.parse('extreme_closeup')).toBe('extreme_close_up');
      expect(ShotSizeSchema.parse('medium_closeup')).toBe('medium_close_up');
      expect(ShotSizeSchema.parse('wide_shot')).toBe('wide');
      expect(ShotSizeSchema.parse('extreme_wide_shot')).toBe('extreme_wide');
    });

    it('coerces camera_movement.kind synonyms (push_in → dolly_in)', () => {
      expect(CameraMovementKindSchema.parse('push_in')).toBe('dolly_in');
      expect(CameraMovementKindSchema.parse('push')).toBe('dolly_in');
      expect(CameraMovementKindSchema.parse('pull_out')).toBe('dolly_out');
      expect(CameraMovementKindSchema.parse('pull_back')).toBe('dolly_out');
      expect(CameraMovementKindSchema.parse('zoom_in')).toBe('dolly_in');
      expect(CameraMovementKindSchema.parse('zoom_out')).toBe('dolly_out');
    });

    it('coerces camera_movement.kind variants (tracking_shot → tracking, pov → pov_walk)', () => {
      expect(CameraMovementKindSchema.parse('tracking_shot')).toBe('tracking');
      expect(CameraMovementKindSchema.parse('follow')).toBe('tracking');
      expect(CameraMovementKindSchema.parse('pov')).toBe('pov_walk');
      expect(CameraMovementKindSchema.parse('first_person')).toBe('pov_walk');
      expect(CameraMovementKindSchema.parse('locked_off')).toBe('static');
      expect(CameraMovementKindSchema.parse('shaky')).toBe('handheld');
      expect(CameraMovementKindSchema.parse('arc')).toBe('orbit');
    });

    it('coerces camera_angle synonyms', () => {
      expect(CameraAngleSchema.parse('over_the_shoulder')).toBe('over_shoulder');
      expect(CameraAngleSchema.parse('ots')).toBe('over_shoulder');
      expect(CameraAngleSchema.parse('birds_eye_view')).toBe('birds_eye');
      expect(CameraAngleSchema.parse('top_down')).toBe('birds_eye');
      expect(CameraAngleSchema.parse('dutch_angle')).toBe('dutch');
      expect(CameraAngleSchema.parse('first_person')).toBe('pov');
    });

    it('preserves canonical values unchanged', () => {
      expect(ShotSizeSchema.parse('close_up')).toBe('close_up');
      expect(CameraMovementKindSchema.parse('dolly_in')).toBe('dolly_in');
      expect(CameraAngleSchema.parse('eye_level')).toBe('eye_level');
    });

    it('still rejects truly unknown values (drift surfaces, not silenced)', () => {
      expect(() => ShotSizeSchema.parse('hyper_extreme')).toThrow();
      expect(() => CameraMovementKindSchema.parse('teleport')).toThrow();
      expect(() => CameraAngleSchema.parse('upside_down_inverted')).toThrow();
    });

    it('reproduces the live failure: medium_wide + push_in pass through Composition + CameraMovement', () => {
      // From Vercel log 2026-05-12 20:54:51: Grok produced these exact values.
      const composition = CompositionSchema.parse({
        shot_size: 'medium_wide',
        angle: 'low_angle',
        framing_notes: 'Brizhik left, sign right',
      });
      expect(composition.shot_size).toBe('wide');
      expect(composition.angle).toBe('low_angle');
    });
  });

  it('parses a VisualTheme with palette + lighting + lens + motion + mood', () => {
    const parsed = VisualThemeSchema.parse({
      palette: ['#F4E4BC', '#3D2914', '#E8B86D'],
      lighting: 'soft golden-hour key + warm fill + cool rim',
      lens: '85mm shallow DOF',
      motion: 'locked-off + occasional slow dolly',
      mood: 'cozy',
    });
    expect(parsed.palette).toHaveLength(3);
  });

  it('rejects palette shorter than 3', () => {
    expect(() =>
      VisualThemeSchema.parse({
        palette: ['#000', '#111'],
        lighting: 'x',
        lens: 'x',
        motion: 'x',
        mood: 'x',
      }),
    ).toThrow();
  });

  it('ArcRole enum contains all 7 roles', () => {
    const roles = ['hook', 'setup', 'rising', 'climax', 'payoff', 'cta', 'beat'];
    for (const r of roles) expect(() => ArcRoleSchema.parse(r)).not.toThrow();
  });
});
