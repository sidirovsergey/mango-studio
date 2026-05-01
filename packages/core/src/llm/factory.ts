import 'server-only';
import { MockLLMProvider } from './mock-provider';
import { OpenRouterLLMProvider } from './openrouter-provider';
import type { LLMProvider } from './provider';

export { MockLLMProvider } from './mock-provider';
export { OpenRouterLLMProvider } from './openrouter-provider';

export function getLLMProvider(): LLMProvider {
  const providerName = process.env.LLM_PROVIDER ?? 'mock';
  if (providerName === 'openrouter') return new OpenRouterLLMProvider();
  if (providerName === 'mock') return new MockLLMProvider();
  throw new Error(`Unknown LLM_PROVIDER: ${providerName} (expected 'mock' | 'openrouter')`);
}
