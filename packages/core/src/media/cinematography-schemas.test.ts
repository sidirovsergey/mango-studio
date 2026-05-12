import { describe, expect, it } from 'vitest';
import { ArcRoleSchema, CompositionSchema, VisualThemeSchema } from './cinematography-schemas';

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
