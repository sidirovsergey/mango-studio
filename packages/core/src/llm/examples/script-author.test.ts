import { describe, expect, it } from 'vitest';
import { ScriptGenSchema } from '../schemas';
import { SCRIPT_EXAMPLES } from './script-author';

describe('SCRIPT_EXAMPLES', () => {
  it('exports two examples: fifteen_sec and sixty_sec', () => {
    expect(SCRIPT_EXAMPLES.fifteen_sec).toBeTypeOf('string');
    expect(SCRIPT_EXAMPLES.sixty_sec).toBeTypeOf('string');
  });

  it('fifteen_sec parses as a valid ScriptGen with 3 scenes and tier economy', () => {
    const parsed = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.fifteen_sec));
    expect(parsed.tier).toBe('economy');
    expect(parsed.scenes).toHaveLength(3);
    expect(parsed.visual_theme).not.toBeNull();
    for (const s of parsed.scenes) {
      expect(s.description_ru.length).toBeGreaterThan(5);
      expect(s.description_en).not.toBeNull();
      expect(s.composition).not.toBeNull();
      expect(s.camera_movement).not.toBeNull();
      expect(s.lighting).not.toBeNull();
      expect(s.arc_role).not.toBeNull();
      // economy tier ⇒ scene duration must be 5 or 10
      expect([5, 10]).toContain(s.duration_sec);
    }
  });

  it('sixty_sec parses as a valid ScriptGen with 6-8 scenes and tier premium', () => {
    const parsed = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.sixty_sec));
    expect(parsed.tier).toBe('premium');
    expect(parsed.scenes.length).toBeGreaterThanOrEqual(6);
    expect(parsed.scenes.length).toBeLessThanOrEqual(8);
    expect(parsed.characters.length).toBeGreaterThanOrEqual(2);
    expect(parsed.visual_theme).not.toBeNull();
    const totalDur = parsed.scenes.reduce((s, sc) => s + sc.duration_sec, 0);
    expect(totalDur).toBeGreaterThanOrEqual(55);
    expect(totalDur).toBeLessThanOrEqual(65);
    // at least one scene has dialogue
    expect(parsed.scenes.some((s) => s.dialogue !== null)).toBe(true);
  });

  it('arc_role values cover the expected pattern in sixty_sec', () => {
    const parsed = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.sixty_sec));
    const roles = parsed.scenes.map((s) => s.arc_role);
    expect(roles).toContain('hook');
    expect(roles).toContain('climax');
    expect(roles).toContain('payoff');
  });
});
