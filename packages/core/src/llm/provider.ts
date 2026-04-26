import 'server-only';
import type { AspectRatio, StyleName } from '../prompt/types';

export interface ScriptGenInput {
  user_prompt: string;
  format: AspectRatio;
  duration_sec: number;
  style: StyleName;
}

export interface ScriptGenOutput {
  title: string;
  scenes: Array<{
    scene_id: string;
    description: string;
    duration_sec: number;
    voiceover?: string;
  }>;
  characters: Array<{ name: string; description: string }>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMProvider {
  generateScript(input: ScriptGenInput): Promise<ScriptGenOutput>;
  refineScene(input: {
    scene_id: string;
    current: string;
    instruction: string;
  }): Promise<{ updated_description: string }>;
  chat(input: { messages: ChatMessage[] }): Promise<{ reply: string }>;
}
