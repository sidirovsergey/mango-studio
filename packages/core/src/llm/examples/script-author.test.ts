import { describe, expect, it } from 'vitest';
import { ScriptGenSchema } from '../schemas';
import { SCRIPT_EXAMPLES } from './script-author';

describe('SCRIPT_EXAMPLES', () => {
  it('exports two examples: fifteen_sec and sixty_sec', () => {
    expect(SCRIPT_EXAMPLES.fifteen_sec).toBeTypeOf('string');
    expect(SCRIPT_EXAMPLES.sixty_sec).toBeTypeOf('string');
  });

  it('fifteen_sec parses as a valid ScriptGen with 2 scenes (10s+5s tail) and tier economy', () => {
    const parsed = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.fifteen_sec));
    expect(parsed.tier).toBe('economy');
    expect(parsed.scenes).toHaveLength(2);
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
    // 10s default + 5s tail = 15s
    const total = parsed.scenes.reduce((sum, sc) => sum + sc.duration_sec, 0);
    expect(total).toBe(15);
    // First scene is the rich 10s default; the 5s is reserved for tail
    expect(parsed.scenes[0]!.duration_sec).toBe(10);
  });

  it('sixty_sec parses as a valid ScriptGen with 6 scenes × 10s and tier premium', () => {
    const parsed = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.sixty_sec));
    expect(parsed.tier).toBe('premium');
    expect(parsed.scenes).toHaveLength(6);
    expect(parsed.characters.length).toBeGreaterThanOrEqual(2);
    expect(parsed.visual_theme).not.toBeNull();
    // Every premium scene defaults to 10s under the new cadence
    for (const s of parsed.scenes) {
      expect(s.duration_sec).toBe(10);
    }
    const totalDur = parsed.scenes.reduce((s, sc) => s + sc.duration_sec, 0);
    expect(totalDur).toBe(60);
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

  it('all scenes carry audio_mode "auto" — resolver decides native vs silent_tts at render time', () => {
    const parsed15 = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.fifteen_sec));
    const parsed60 = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.sixty_sec));
    for (const s of [...parsed15.scenes, ...parsed60.scenes]) {
      expect(s.audio_mode).toBe('auto');
    }
  });

  it('10s scenes use internal sub-beat markers (0–3s:, 3–7s:, 7–10s:) in description_ru', () => {
    const parsed = ScriptGenSchema.parse(JSON.parse(SCRIPT_EXAMPLES.sixty_sec));
    for (const s of parsed.scenes) {
      // Internal beat markers anchor a 10s scene to time, preventing
      // the LLM from interpreting "one scene = one frozen moment".
      expect(s.description_ru).toMatch(/\d+–\d+s:/);
    }
  });
});
