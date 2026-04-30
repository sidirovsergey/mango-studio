import type { AspectRatio, StyleName } from '../prompt/types';
import type { Character } from './types';

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  model: string;
  latency_ms: number;
}

export interface ScriptGenInput {
  user_prompt: string;
  format: AspectRatio;
  duration_sec: number;
  style: StyleName;
  /** Existing active characters to pass as context for character-aware generation */
  existingCharacters?: Array<{ id: string; name: string; description: string }>;
}

export interface ScriptGenOutput {
  title: string;
  scenes: Array<{
    scene_id: string;
    description: string;
    duration_sec: number;
    voiceover?: string;
  }>;
  characters: Array<
    | { action: 'keep'; id: string }
    | { action: 'add'; name: string; description: string; appearance?: Record<string, unknown>; personality?: string }
    | { action: 'remove'; id: string }
  >;
}

export interface RefineSceneInput {
  scene_id: string;
  current: string;
  instruction: string;
}

export interface RefineSceneOutput {
  updated_description: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatInput {
  messages: ChatMessage[];
}

export interface ChatOutput {
  reply: string;
}

/**
 * The shape stored in DB after diff-merge has been applied.
 * characters is a full Character[] (not ScriptCharacterAction[]).
 */
export interface PersistedScript {
  title: string;
  scenes: Array<{
    scene_id: string;
    description: string;
    duration_sec: number;
    voiceover?: string;
  }>;
  characters: Character[];
}

export interface ScriptGenResult {
  output: ScriptGenOutput;
  usage: LLMUsage;
}
export interface RefineSceneResult {
  output: RefineSceneOutput;
  usage: LLMUsage;
}
export interface ChatResult {
  output: ChatOutput;
  usage: LLMUsage;
}

export interface LLMProvider {
  generateScript(input: ScriptGenInput): Promise<ScriptGenResult>;
  refineScene(input: RefineSceneInput): Promise<RefineSceneResult>;
  chat(input: ChatInput): Promise<ChatResult>;
}
