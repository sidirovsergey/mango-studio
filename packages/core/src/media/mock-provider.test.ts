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
  it('submitCharacterDossier returns a handle with fal_request_id', async () => {
    const p = new MockMediaProvider();
    const handle = await p.submitCharacterDossier(input, ctx);
    expect(handle.fal_request_id).toBeTruthy();
    expect(handle.fal_request_id).toContain('dossier');
  });

  it('model_used matches input.model', async () => {
    const p = new MockMediaProvider();
    const handle = await p.submitCharacterDossier(input, ctx);
    expect(handle.model_used).toBe(input.model);
  });

  it('getJobStatus returns completed', async () => {
    const p = new MockMediaProvider();
    const status = await p.getJobStatus('mock-req', 'mock-model');
    expect(status.status).toBe('completed');
  });

  it('getJobResult returns primary_url', async () => {
    const p = new MockMediaProvider();
    const result = await p.getJobResult('mock-req', 'mock-model');
    expect(result.primary_url).toContain('mock-result');
    expect(result.cost_usd).toBe(0);
    expect(result.latency_ms).toBe(1);
  });
});
