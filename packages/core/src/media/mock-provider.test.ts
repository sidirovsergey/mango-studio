import { describe, expect, it } from 'vitest';
import { MockMediaProvider } from './mock-provider';
import type { AssetContext, GenerateCharacterDossierInput } from './provider';

const ctx: AssetContext = {
  user_id: 'u1',
  project_id: 'p1',
  character_id: 'c1',
};

const input: GenerateCharacterDossierInput = {
  prompt: 'A brave hero',
  model: 'fal-ai/flux/dev',
  format: '16:9',
  quality: '1080p',
};

describe('MockMediaProvider', () => {
  it('generateCharacterDossier returns a fal_url', async () => {
    const p = new MockMediaProvider();
    const result = await p.generateCharacterDossier(input, ctx);
    expect(result.fal_url).toContain('mock-dossier');
    expect(result.cost_usd).toBe(0);
    expect(result.latency_ms).toBe(1);
  });

  it('model_used matches input.model', async () => {
    const p = new MockMediaProvider();
    const result = await p.generateCharacterDossier(input, ctx);
    expect(result.model_used).toBe(input.model);
  });

  it('fal_request_id is set', async () => {
    const p = new MockMediaProvider();
    const result = await p.generateCharacterDossier(input, ctx);
    expect(result.fal_request_id).toBeTruthy();
  });
});
