import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from './mock-provider';

describe('MockLLMProvider', () => {
  it('generateScript returns {output, usage} from fixtures', async () => {
    const p = new MockLLMProvider();
    const result = await p.generateScript({
      user_prompt: 'Дельфин ищет работу',
      format: '16:9',
      duration_sec: 40,
      style: '3d_pixar',
    });
    expect(result.output.title).toBeTruthy();
    expect(result.output.scenes.length).toBeGreaterThan(0);
    expect(result.output.characters.length).toBeGreaterThan(0);
    expect(result.usage.model).toBe('mock');
    expect(result.usage.prompt_tokens).toBeGreaterThanOrEqual(0);
    expect(result.usage.completion_tokens).toBeGreaterThanOrEqual(0);
    expect(result.usage.cost_usd).toBe(0);
    expect(result.usage.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('refineScene returns {output, usage}', async () => {
    const p = new MockLLMProvider();
    const result = await p.refineScene({
      scene_id: 's1',
      current: 'Денни печатает',
      instruction: 'Добавь эмоций',
    });
    expect(result.output.updated_description).toBeTruthy();
    expect(result.usage.model).toBe('mock');
    expect(result.usage.cost_usd).toBe(0);
  });

  it('chat returns {output, usage} for messages', async () => {
    const p = new MockLLMProvider();
    const result = await p.chat({
      messages: [{ role: 'user', content: 'Привет' }],
    });
    expect(result.output.reply).toBeTruthy();
    expect(result.usage.model).toBe('mock');
    expect(result.usage.cost_usd).toBe(0);
  });
});
