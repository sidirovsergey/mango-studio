import { describe, expect, it } from 'vitest';
import { MockLLMProvider } from './mock-provider';

describe('MockLLMProvider', () => {
  it('generateScript returns title + scenes from fixtures', async () => {
    const p = new MockLLMProvider();
    const result = await p.generateScript({
      user_prompt: 'Дельфин ищет работу',
      format: '16:9',
      duration_sec: 40,
      style: '3d_pixar',
    });
    expect(result.title).toBeTruthy();
    expect(result.scenes.length).toBeGreaterThan(0);
    expect(result.characters.length).toBeGreaterThan(0);
  });

  it('refineScene returns updated_description', async () => {
    const p = new MockLLMProvider();
    const result = await p.refineScene({
      scene_id: 's1',
      current: 'Дэнни печатает',
      instruction: 'Добавь эмоций',
    });
    expect(result.updated_description).toBeTruthy();
  });

  it('chat returns reply for messages', async () => {
    const p = new MockLLMProvider();
    const result = await p.chat({
      messages: [{ role: 'user', content: 'Привет' }],
    });
    expect(result.reply).toBeTruthy();
  });
});
