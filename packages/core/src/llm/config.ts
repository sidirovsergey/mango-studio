export type LLMTask = 'script' | 'refine' | 'chat';

export interface ModelParams {
  model: string;
  temperature: number;
  max_tokens: number;
}

// 2026-05-16 hot-fix: xAI deprecated Grok 4.1 Fast — OpenRouter returns HTTP 404
// "Grok 4.1 Fast is deprecated. xAI recommends switching to Grok 4.3".
// Script + refine (both use DEFAULT_MODEL) were broken in prod with `[ORL.script]
// FAIL` for every user. Reproduced locally with the same input via Grok 4.3 — works.
const DEFAULT_MODEL = 'x-ai/grok-4.3';
// Phase 1.2.6 — chat нуждается в более сильной tool-discipline чем Grok.
// Sonnet 4.6 — баланс цена/качество для tool calling.
// ВАЖНО: ID в формате OpenRouter — `claude-sonnet-4.6` (с точкой).
// Раньше было `claude-sonnet-4-6` (с дефисом) — генерация работала через
// alias, но pricing API (calculateCost) не находил модель → cost_usd=0.
const DEFAULT_CHAT_MODEL = 'anthropic/claude-sonnet-4.6';

// Phase 1.4 — output schema expanded ~2x per scene (composition, camera_movement,
// lighting, audio_direction, arc_role, description_en/ru, tier_at_gen) +
// script-root visual_theme + 7-axis narrator_voice.persona. A 60s/12-scene
// script can hit ~6-8k output tokens. The previous cap of 4000 caused
// truncation → JSON.parse failure → 500 from `[ORL.script]`. 12000 gives
// headroom for the largest 90s/18-scene scripts while staying well under
// Grok 4.1 Fast's ~16k output ceiling. Tunable via env for emergency rollback.
const SCRIPT_MAX_TOKENS = Number(process.env.MANGO_LLM_SCRIPT_MAX_TOKENS ?? 12000);
const REFINE_MAX_TOKENS = Number(process.env.MANGO_LLM_REFINE_MAX_TOKENS ?? 1500);
const CHAT_MAX_TOKENS = Number(process.env.MANGO_LLM_CHAT_MAX_TOKENS ?? 2000);

export const MODEL_PARAMS: Record<LLMTask, ModelParams> = {
  script: {
    model: process.env.LLM_MODEL_SCRIPT ?? DEFAULT_MODEL,
    temperature: 0.8,
    max_tokens: SCRIPT_MAX_TOKENS,
  },
  refine: {
    model: process.env.LLM_MODEL_REFINE ?? DEFAULT_MODEL,
    temperature: 0.7,
    max_tokens: REFINE_MAX_TOKENS,
  },
  chat: {
    model: process.env.LLM_MODEL_CHAT ?? DEFAULT_CHAT_MODEL,
    temperature: 0.6,
    max_tokens: CHAT_MAX_TOKENS,
  },
};

export function getModelParams(task: LLMTask): ModelParams {
  return MODEL_PARAMS[task];
}
