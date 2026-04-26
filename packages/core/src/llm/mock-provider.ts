import 'server-only';
import { demoScripts } from '../fixtures/scripts';
import type { ChatMessage, LLMProvider, ScriptGenInput, ScriptGenOutput } from './provider';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockLLMProvider implements LLMProvider {
  async generateScript(_input: ScriptGenInput): Promise<ScriptGenOutput> {
    await delay(1500);
    const fixture = demoScripts.default!;
    return {
      title: fixture.title,
      scenes: fixture.scenes,
      characters: fixture.characters,
    };
  }

  async refineScene(input: {
    scene_id: string;
    current: string;
    instruction: string;
  }): Promise<{ updated_description: string }> {
    await delay(800);
    return {
      updated_description: `${input.current} (с улучшением: ${input.instruction})`,
    };
  }

  async chat(input: { messages: ChatMessage[] }): Promise<{ reply: string }> {
    await delay(600);
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    return {
      reply: lastUser
        ? `Mock-ответ на: «${lastUser.content.slice(0, 40)}${lastUser.content.length > 40 ? '...' : ''}»`
        : 'Mock-ответ',
    };
  }
}
