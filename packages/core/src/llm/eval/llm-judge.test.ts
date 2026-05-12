/**
 * Tests for LLM judge — T4 (video prompt quality) + T5 (description faithfulness).
 *
 * All tests are guarded with `it.skipIf(!process.env.OPENROUTER_API_KEY)`.
 * Without a real key:   tests SKIP (vitest counts them as passed/skipped, never fail).
 * With a real key:      tests run full network calls against Sonnet 4.6 via OpenRouter.
 *
 * CI cost note: each skipped test costs $0. When run with a real key:
 *   - T4 judge call: ~500 in + 200 out = ~$0.005 per call
 * Recommendation: gate on `main` merge only, not every PR, to avoid ~$0.40/run cost.
 */

import { describe, expect, it } from 'vitest';
import { JudgeBudgetExceededError, judgeVideoPrompt } from './llm-judge';
import { CANONICAL_SCENES } from './snapshot-fixtures';

const HAS_KEY = !!process.env.OPENROUTER_API_KEY;

// ---------------------------------------------------------------------------
// T4 — Video prompt judge
// ---------------------------------------------------------------------------

describe('LLM Judge — video prompt (T4)', () => {
  it.skipIf(!HAS_KEY)(
    'returns score 0-10 + rationale + cost for a sample prompt',
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const fixture = CANONICAL_SCENES[0]!; // quiet: cat on windowsill — always present
      // Hand-authored minimal prompt covering the rubric axes.
      const samplePrompt = [
        'Ginger tabby cat Apelsin curled on a sunlit windowsill.',
        'Framing: Full shot, Eye Level',
        'Static — 85mm f/1.8 shallow DOF; shot: Full, Eye Level',
        'Lighting: soft golden-hour key + warm fill from window + cool rim from outside',
        'Palette: warm amber tones, soft highlights',
        '[AUDIO]',
        'Ambient: quiet birdsong, distant city hum.',
        'Music: gentle piano, pianissimo, warm major key.',
        'SFX: soft purring.',
        'Avoid: harsh shadows, fast cuts, text overlays, abrupt movements.',
      ].join('\n');

      const result = await judgeVideoPrompt({
        prompt: samplePrompt,
        scene_description_ru: fixture.scene.description_ru ?? fixture.scene.description,
        // description_en is string | null in Scene; convert null → undefined for the input type
        scene_description_en: fixture.scene.description_en ?? undefined,
        shot_intent: fixture.description,
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.rationale).toBeTruthy();
      expect(result.rationale.length).toBeGreaterThan(5);
      expect(result.cost_usd).toBeGreaterThan(0);
      expect(result.cost_usd).toBeLessThan(0.02);
    },
    30_000,
  );

  it.skipIf(!HAS_KEY)(
    'scores a low-quality prompt lower than a high-quality prompt',
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const fixture = CANONICAL_SCENES[0]!; // quiet: cat on windowsill — always present
      const baseInput = {
        scene_description_ru: fixture.scene.description_ru ?? fixture.scene.description,
        scene_description_en: fixture.scene.description_en ?? undefined,
        shot_intent: fixture.description,
      };

      const highQualityPrompt = [
        'Ginger tabby cat Apelsin curled on a sunlit windowsill.',
        'Framing: Full shot, Eye Level',
        'Dolly In (slow) — 85mm anamorphic; shot: Full, Eye Level',
        'Lighting: soft golden-hour key from upper-left + warm fill + cool rim',
        'Palette: warm amber, soft gold highlights, cool shadow fills',
        '[AUDIO]',
        'Ambient: quiet birdsong. Music: gentle piano pianissimo. SFX: soft purring.',
        'Avoid: harsh shadows, fast cuts, busy backgrounds, text overlays.',
      ].join('\n');

      const lowQualityPrompt = 'A cat is sleeping.';

      const [highResult, lowResult] = await Promise.all([
        judgeVideoPrompt({ ...baseInput, prompt: highQualityPrompt }),
        judgeVideoPrompt({ ...baseInput, prompt: lowQualityPrompt }),
      ]);

      // High-quality prompt should score higher than low-quality
      expect(highResult.score).toBeGreaterThan(lowResult.score);
    },
    60_000,
  );

  it.skipIf(!HAS_KEY)(
    'cost_usd is within budget for all 5 canonical scenes',
    async () => {
      for (const fixture of CANONICAL_SCENES) {
        const samplePrompt = [
          fixture.scene.description_en ?? fixture.scene.description,
          'Framing: Full shot, Eye Level',
          'Static — 85mm; shot: Full, Eye Level',
          'Lighting: soft key + fill + rim',
          '[AUDIO] Ambient: environment sounds.',
          'Avoid: abrupt cuts.',
        ].join('\n');

        const result = await judgeVideoPrompt({
          prompt: samplePrompt,
          scene_description_ru: fixture.scene.description_ru ?? fixture.scene.description,
          scene_description_en: fixture.scene.description_en ?? undefined,
          shot_intent: fixture.description,
        });

        expect(result.cost_usd).toBeLessThan(0.02);
      }
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// Unit tests — no API key required
// ---------------------------------------------------------------------------

describe('LLM Judge — unit tests (no API key)', () => {
  it('JudgeBudgetExceededError has correct name and message', () => {
    const err = new JudgeBudgetExceededError(0.025);
    expect(err.name).toBe('JudgeBudgetExceededError');
    expect(err.actual_cost_usd).toBe(0.025);
    expect(err.message).toContain('0.02500');
    expect(err.message).toContain('0.02');
  });

  it('judgeVideoPrompt throws without OPENROUTER_API_KEY', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = '';
    try {
      await expect(
        judgeVideoPrompt({
          prompt: 'test',
          scene_description_ru: 'тест',
          shot_intent: 'test',
        }),
      ).rejects.toThrow('OPENROUTER_API_KEY');
    } finally {
      process.env.OPENROUTER_API_KEY = saved;
    }
  });
});
