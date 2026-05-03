import 'server-only';
import { demoScripts } from '../fixtures/scripts';
import type {
  ChatInput,
  ChatResult,
  LLMProvider,
  LLMUsage,
  RefineSceneInput,
  RefineSceneResult,
  ScriptGenInput,
  ScriptGenResult,
} from './provider';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockUsage(latency_ms: number): LLMUsage {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0,
    model: 'mock',
    latency_ms,
  };
}

export class MockLLMProvider implements LLMProvider {
  async generateScript(_input: ScriptGenInput): Promise<ScriptGenResult> {
    const start = Date.now();
    await delay(1500);
    const fixture = demoScripts.default!;
    return {
      output: {
        title: fixture.title,
        scenes: fixture.scenes,
        characters: fixture.characters,
        master_clip: null,
      },
      usage: mockUsage(Date.now() - start),
    };
  }

  async refineScene(input: RefineSceneInput): Promise<RefineSceneResult> {
    const start = Date.now();
    await delay(800);
    return {
      output: {
        updated_description: `${input.current} (с улучшением: ${input.instruction})`,
      },
      usage: mockUsage(Date.now() - start),
    };
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    const start = Date.now();
    await delay(600);
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    return {
      output: {
        reply: lastUser
          ? `Mock-ответ на: «${lastUser.content.slice(0, 40)}${lastUser.content.length > 40 ? '...' : ''}»`
          : 'Mock-ответ',
      },
      usage: mockUsage(Date.now() - start),
    };
  }
}
