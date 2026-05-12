/**
 * Tests for LLM judge — T4 (video prompt quality) + T5 (description faithfulness).
 *
 * All tests are guarded with `it.skipIf(!process.env.OPENROUTER_API_KEY)`.
 * Without a real key:   tests SKIP (vitest counts them as passed/skipped, never fail).
 * With a real key:      tests run full network calls against Sonnet 4.6 via OpenRouter.
 *
 * CI cost note: each skipped test costs $0. When run with a real key:
 *   - T4 judge call: ~500 in + 200 out = ~$0.005 per call
 *   - T5 judge call: ~200 in + 100 out = ~$0.003 per call
 *   - CI gate (5 scenes): ~$0.015 total for the faithfulness suite
 * Recommendation: gate on `main` merge only, not every PR, to avoid ~$0.40/run cost.
 */

import { describe, expect, it } from 'vitest';
import {
  JudgeBudgetExceededError,
  judgeDescriptionFaithfulness,
  judgeVideoPrompt,
} from './llm-judge';
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
// T5 — Description faithfulness judge
// ---------------------------------------------------------------------------

describe('LLM Judge — description faithfulness (T5)', () => {
  it.skipIf(!HAS_KEY)(
    'returns score 0-10 for a known-good RU/EN pair',
    async () => {
      const result = await judgeDescriptionFaithfulness({
        description_ru: 'Рыжий кот спит на подоконнике в солнечном луче.',
        description_en: 'Ginger cat sleeps on a windowsill in a beam of sunlight.',
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.rationale).toBeTruthy();
      expect(result.cost_usd).toBeLessThan(0.02);
      // Known-good pair — should score high
      expect(result.score).toBeGreaterThanOrEqual(7);
    },
    30_000,
  );

  it.skipIf(!HAS_KEY)(
    'penalizes mismatched descriptions (score < 5)',
    async () => {
      const result = await judgeDescriptionFaithfulness({
        description_ru: 'Рыжий кот спит на подоконнике в солнечном луче.',
        description_en: 'A black labrador runs across a beach.', // completely unrelated
      });

      expect(result.score).toBeLessThan(5);
    },
    30_000,
  );

  it.skipIf(!HAS_KEY)(
    'penalizes partial mismatch (additions/omissions)',
    async () => {
      const result = await judgeDescriptionFaithfulness({
        description_ru: 'Рыжий кот мирно спит, его грудь медленно поднимается.',
        // EN adds unrelated detail (barking dog) and drops the breathing mention
        description_en: 'A ginger cat rests on a surface while a dog barks in the background.',
      });

      // Should score lower than a perfect match (≥7) but higher than a total mismatch
      expect(result.score).toBeLessThan(9);
    },
    30_000,
  );
});

// ---------------------------------------------------------------------------
// T5 CI gate — mean ≥8 across all 5 canonical scene RU/EN pairs
// ---------------------------------------------------------------------------

describe('Faithfulness CI gate — mean ≥8 across canonical fixtures (T5)', () => {
  it.skipIf(!HAS_KEY)(
    'all canonical scenes with description_en pass mean ≥8',
    async () => {
      const scores: number[] = [];

      for (const fixture of CANONICAL_SCENES) {
        const descEn = fixture.scene.description_en;
        const descRu = fixture.scene.description_ru ?? fixture.scene.description;
        if (!descEn) continue;

        const result = await judgeDescriptionFaithfulness({
          description_ru: descRu,
          description_en: descEn,
        });

        console.log(
          `[CI gate] fixture=${fixture.label} score=${result.score} rationale="${result.rationale}"`,
        );
        scores.push(result.score);
      }

      expect(scores.length).toBeGreaterThan(0);

      const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
      console.log(
        `[CI gate] mean faithfulness score = ${mean.toFixed(2)} across ${scores.length} fixtures`,
      );
      expect(mean).toBeGreaterThanOrEqual(8);
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

  it('judgeDescriptionFaithfulness throws without OPENROUTER_API_KEY', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = '';
    try {
      await expect(
        judgeDescriptionFaithfulness({
          description_ru: 'тест',
          description_en: 'test',
        }),
      ).rejects.toThrow('OPENROUTER_API_KEY');
    } finally {
      process.env.OPENROUTER_API_KEY = saved;
    }
  });
});
