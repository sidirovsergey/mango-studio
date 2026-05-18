import { describe, expect, it } from 'vitest';
import futureV18 from './fixtures/future-v1.8.json';
import legacyAsymmetric from './fixtures/legacy-asymmetric.json';
import legacySymmetric from './fixtures/legacy-symmetric.json';
import { normalizeScript } from './normalize-script';
import { SceneSchema } from './schemas';

describe('normalizeScript — Phase 1.8.0a adapter (reader-only)', () => {
  // 1. Symmetric legacy projects (description == description_ru) — happy path.
  it('legacy symmetric: narrative_paragraph === description_ru (UI canonical)', () => {
    const r = normalizeScript(legacySymmetric);
    expect(r.scenes[0]?.narrative_paragraph).toBe(legacySymmetric.scenes[0]?.description_ru);
    expect(r.scenes[0]?.narrative_paragraph).toBe(legacySymmetric.scenes[0]?.description);
  });

  // 2. Legacy dialogue: null → empty array (not throwing).
  it('legacy dialogue:null normalizes to []', () => {
    const r = normalizeScript(legacyAsymmetric);
    // s1 has dialogue: null
    expect(r.scenes[0]?.dialogue).toEqual([]);
    expect(r.scenes[0]?.legacy_dialogue).toBeNull();
    // s2 has single dialogue
    expect(r.scenes[1]?.dialogue.length).toBe(1);
    expect(r.scenes[1]?.legacy_dialogue?.speaker).toBe('fisherman');
  });

  // 3. Future schema parses cleanly with passthrough fields.
  it('future v1.8: dialogue[] + shots[] + narrative_paragraph preserved', () => {
    const r = normalizeScript(futureV18);
    expect(r.scenes[0]?.dialogue.length).toBe(2);
    expect(r.scenes[0]?.shots.length).toBe(2);
    expect(r.scenes[0]?.narrative_paragraph).toContain('Шрёдингер');
  });

  // 4. Mixed: shouldn't crash even when scene set is heterogenous.
  it('mixed schemas across scenes: each scene normalises in isolation', () => {
    const mixed = {
      scenes: [
        {
          scene_id: 'legacy',
          description: 'Old shape',
          description_ru: 'Старая форма',
          duration_sec: 5,
          dialogue: { speaker: 'narrator', text: 'hello' },
        },
        {
          scene_id: 'future',
          duration_sec: 5,
          narrative_paragraph: 'Новая форма',
          dialogue: [
            { speaker: 'a', text: 'one' },
            { speaker: 'b', text: 'two' },
          ],
          shots: [{ shot_id: 'f_shot1', description: 'desc', image_prompt: 'EN prompt' }],
        },
      ],
      characters: [],
    };
    const r = normalizeScript(mixed);
    expect(r.scenes[0]?.dialogue.length).toBe(1);
    expect(r.scenes[1]?.dialogue.length).toBe(2);
    expect(r.scenes[1]?.shots[0]?.image_prompt).toBe('EN prompt');
  });

  // 5. Idempotency — normalize-then-renormalize via .raw yields deep-equal scenes.
  it('idempotency: normalize(normalize(x).raw) deep-equal normalize(x).scenes', () => {
    const r1 = normalizeScript(legacySymmetric);
    const r2 = normalizeScript(r1.raw);
    expect(r2.scenes).toEqual(r1.scenes);
  });

  // 6. Defensive: missing description doesn't throw.
  it('defensive: missing description coerces to empty string', () => {
    const r = normalizeScript({
      scenes: [{ scene_id: 'x', duration_sec: 5 }],
      characters: [],
    });
    expect(r.scenes[0]?.description).toBe('');
    expect(r.scenes[0]?.narrative_paragraph).toBe('');
    expect(r.scenes[0]?.image_prompt_text).toBe('');
  });

  // 7. Defensive: dialogue malformed → falls through to dialogue=[] (don't crash UI).
  it('defensive: malformed dialogue value → ZodError surfaces (not silent)', () => {
    expect(() =>
      normalizeScript({
        scenes: [{ scene_id: 'x', duration_sec: 5, dialogue: 'not an object' }],
        characters: [],
      }),
    ).toThrow();
  });

  // 8. Round-trip: .raw IS the exact original input by reference.
  it('round-trip: result.raw === input (reference equality)', () => {
    const r = normalizeScript(legacySymmetric);
    expect(r.raw).toBe(legacySymmetric);
  });

  // 9. Shots synthesis from image_prompt_text default chain.
  it('shots synthesis: missing shots → 1 default with image_prompt = description_en ?? description', () => {
    const r = normalizeScript(legacyAsymmetric);
    // legacy-asymmetric has description_en set → shot.image_prompt should be the English one.
    expect(r.scenes[0]?.shots.length).toBe(1);
    expect(r.scenes[0]?.shots[0]?.image_prompt).toBe(legacyAsymmetric.scenes[0]?.description_en);
  });

  // 10. Characters passthrough — unchanged length + content references.
  it('characters passthrough: unchanged length + content', () => {
    const r = normalizeScript(legacySymmetric);
    expect(r.characters.length).toBe(legacySymmetric.characters.length);
    expect(r.characters[0]).toEqual(legacySymmetric.characters[0]);
  });

  // 11. CRITICAL — asymmetric description case: two channels produce DIFFERENT outputs.
  //     (Codex audit blocker fix.)
  it('asymmetric description (description != description_ru): two channels diverge correctly', () => {
    const r = normalizeScript(legacyAsymmetric);
    const s = r.scenes[0]!;
    // narrative_paragraph follows description_ru (Russian, for UI)
    expect(s.narrative_paragraph).toBe(legacyAsymmetric.scenes[0]?.description_ru);
    // image_prompt_text follows description_en ?? description (English-preferred)
    expect(s.image_prompt_text).toBe(legacyAsymmetric.scenes[0]?.description_en);
    expect(s.narrative_paragraph).not.toBe(s.image_prompt_text);
  });

  // 12. CRITICAL — director-state-summary chain preserved (English context for downstream models).
  it('image_prompt_text falls back to description when description_en is null', () => {
    const r = normalizeScript({
      scenes: [
        {
          scene_id: 'no_en',
          description: 'plain raw description',
          description_ru: 'русский текст',
          description_en: null,
          duration_sec: 5,
        },
      ],
      characters: [],
    });
    // No description_en → fall back to description (NOT description_ru)
    expect(r.scenes[0]?.image_prompt_text).toBe('plain raw description');
    expect(r.scenes[0]?.narrative_paragraph).toBe('русский текст');
  });

  // 13. Scene-level passthrough preserves unknown fields in `.raw`.
  it('scene-level unknown field survives in .raw', () => {
    const input = {
      scenes: [
        {
          scene_id: 'x',
          duration_sec: 5,
          description: 'test',
          my_custom_field: 'experimental-value',
        },
      ],
      characters: [],
    };
    const r = normalizeScript(input);
    const rawScene0 = (r.raw as { scenes: Array<Record<string, unknown>> }).scenes[0];
    expect(rawScene0?.my_custom_field).toBe('experimental-value');
  });

  // 14. Empty-scenes script: doesn't throw, scenes array is empty.
  it('empty scenes array: returns empty NormalizedScene[] without error', () => {
    const r = normalizeScript({ scenes: [], characters: [] });
    expect(r.scenes).toEqual([]);
    expect(r.characters).toEqual([]);
  });

  // 15. CONTRACT — legacy fixture passes the production v1.4 SceneSchema parse.
  //     (Codex audit A #2 fix.) Proves the adapter still accepts known-valid
  //     production scene shape rather than only handpicked test shape.
  it('contract: legacy-symmetric scenes pass production SceneSchema parse', () => {
    for (const scene of legacySymmetric.scenes) {
      expect(() => SceneSchema.parse(scene)).not.toThrow();
    }
  });

  it('contract: legacy-asymmetric scenes pass production SceneSchema parse', () => {
    for (const scene of legacyAsymmetric.scenes) {
      expect(() => SceneSchema.parse(scene)).not.toThrow();
    }
  });
});
