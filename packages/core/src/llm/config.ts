import 'server-only';

export type LLMTask = 'script' | 'refine' | 'chat';

export interface ModelParams {
  model: string;
  temperature: number;
  max_tokens: number;
}

const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';

export const MODEL_PARAMS: Record<LLMTask, ModelParams> = {
  script: {
    model: process.env.LLM_MODEL_SCRIPT ?? DEFAULT_MODEL,
    temperature: 0.8,
    max_tokens: 4000,
  },
  refine: {
    model: process.env.LLM_MODEL_REFINE ?? DEFAULT_MODEL,
    temperature: 0.7,
    max_tokens: 800,
  },
  chat: {
    model: process.env.LLM_MODEL_CHAT ?? DEFAULT_MODEL,
    temperature: 0.6,
    max_tokens: 1500,
  },
};

export function getModelParams(task: LLMTask): ModelParams {
  return MODEL_PARAMS[task];
}
