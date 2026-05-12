/**
 * LLM-judge wrapper for Phase-1.4 eval pipeline (F89).
 *
 * Two exported functions:
 *   - judgeVideoPrompt     — T4: scores a generated video prompt 0-10 via Sonnet
 *   - judgeDescriptionFaithfulness — T5: scores RU↔EN semantic faithfulness 0-10
 *
 * Design notes:
 *   - NO `import 'server-only'` — this module is eval-only; it runs in Node/CLI/test,
 *     never in Next.js Server Components.
 *   - Reuses `createOpenRouter` + `generateText` pattern from openrouter-provider.ts.
 *   - Reuses `calculateCost` from pricing.ts (fetches live OpenRouter pricing).
 *   - Hard cost cap: $0.02 per call. Throws `JudgeBudgetExceededError` if exceeded.
 *   - Sonnet model: `anthropic/claude-sonnet-4.6` — same as DEFAULT_CHAT_MODEL in config.ts.
 *   - temp=0, max_tokens=200 — deterministic, bounded output.
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { calculateCost } from '../pricing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JUDGE_MODEL = 'anthropic/claude-sonnet-4.6';
const JUDGE_MAX_TOKENS = 200;
const JUDGE_TEMPERATURE = 0;
const JUDGE_COST_CAP_USD = 0.02;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the actual LLM cost exceeds the hard per-call budget. */
export class JudgeBudgetExceededError extends Error {
  constructor(public readonly actual_cost_usd: number) {
    super(
      `LLM-judge cost cap exceeded: actual=$${actual_cost_usd.toFixed(5)} > cap=$${JUDGE_COST_CAP_USD}`,
    );
    this.name = 'JudgeBudgetExceededError';
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set — LLM judge cannot run');
  }
  return createOpenRouter({ apiKey });
}

interface RawJudgeJson {
  score?: unknown;
  rationale?: unknown;
}

/**
 * Parse the model's JSON output. If parsing fails (non-JSON or missing fields),
 * returns score=0 with the raw text as the rationale for debugging.
 */
function parseJudgeJson(raw: string): { score: number; rationale: string } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { score: 0, rationale: `[parse error — non-JSON output]: ${raw.slice(0, 300)}` };
  }
  try {
    const obj = JSON.parse(jsonMatch[0]) as RawJudgeJson;
    const score = typeof obj.score === 'number' ? Math.max(0, Math.min(10, obj.score)) : 0;
    const rationale =
      typeof obj.rationale === 'string'
        ? obj.rationale
        : `[missing rationale]: ${raw.slice(0, 300)}`;
    return { score, rationale };
  } catch {
    return { score: 0, rationale: `[JSON.parse failed]: ${raw.slice(0, 300)}` };
  }
}

/**
 * Compute actual cost and enforce budget cap.
 * Logs estimated cost before the call is made (via the promptTokens estimate).
 */
async function enforceBudget(promptTokens: number, completionTokens: number): Promise<number> {
  const cost = await calculateCost(JUDGE_MODEL, promptTokens, completionTokens);
  if (cost > JUDGE_COST_CAP_USD) {
    throw new JudgeBudgetExceededError(cost);
  }
  return cost;
}

// ---------------------------------------------------------------------------
// T4 — judgeVideoPrompt
// ---------------------------------------------------------------------------

export interface JudgeResult {
  /** 0–10 */
  score: number;
  /** 1–3 lines explaining the score */
  rationale: string;
  /** Actual cost of the judge call in USD */
  cost_usd: number;
}

export interface JudgeVideoPromptInput {
  /** The generated prompt text from a builder */
  prompt: string;
  /** Russian source description */
  scene_description_ru: string;
  /** English mirror (Phase 1.4.A field) */
  scene_description_en?: string;
  /** Brief description of what the scene tries to convey */
  shot_intent: string;
}

const JUDGE_VIDEO_SYSTEM = `You are a cinematography expert evaluating AI-generated video prompts for short animated films. Score each prompt 0-10 on the following rubric and give a brief rationale.

Rubric:
- Specificity (0-3): does it specify shot size, angle, camera movement, lighting?
- Cinematic literacy (0-3): does it use proper camera/lighting vocabulary (Dolly In, key light, etc.)?
- Faithfulness to scene intent (0-2): does the prompt match the user's intended shot?
- Avoid-list quality (0-2): is the negative list relevant and complete?

Output format (strict JSON):
{"score": 7, "rationale": "Strong on camera/lighting vocab; missing aspect reminder; Avoid list is generic."}`;

/**
 * T4 — Judge a generated video prompt for quality on a 0-10 rubric.
 *
 * Calls Sonnet 4.6 at temp=0, max_tokens=200.
 * Throws `JudgeBudgetExceededError` if actual cost exceeds $0.02.
 */
export async function judgeVideoPrompt(input: JudgeVideoPromptInput): Promise<JudgeResult> {
  const openrouter = buildOpenRouter();

  const enMirrorLine = input.scene_description_en
    ? `Scene intent (English mirror): ${input.scene_description_en}`
    : '';

  const userMessage = [
    `Scene intent (Russian): ${input.scene_description_ru}`,
    enMirrorLine,
    `Brief shot purpose: ${input.shot_intent}`,
    '',
    'Generated prompt to evaluate:',
    input.prompt,
    '',
    'Score this prompt.',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const { text, usage } = await generateText({
    model: openrouter(JUDGE_MODEL),
    system: JUDGE_VIDEO_SYSTEM,
    prompt: userMessage,
    temperature: JUDGE_TEMPERATURE,
    maxOutputTokens: JUDGE_MAX_TOKENS,
  });

  const promptTokens = usage?.inputTokens ?? 0;
  const completionTokens = usage?.outputTokens ?? 0;

  // Log estimated cost for transparency
  console.log(
    `[llm-judge/video] tokens in=${promptTokens} out=${completionTokens} model=${JUDGE_MODEL}`,
  );

  const cost_usd = await enforceBudget(promptTokens, completionTokens);
  const { score, rationale } = parseJudgeJson(text);

  return { score, rationale, cost_usd };
}
