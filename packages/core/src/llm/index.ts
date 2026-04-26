import 'server-only';
import { MockLLMProvider } from './mock-provider';
import type { LLMProvider } from './provider';

export type { LLMProvider, ScriptGenInput, ScriptGenOutput, ChatMessage } from './provider';

export function getLLMProvider(): LLMProvider {
  return new MockLLMProvider();
}
