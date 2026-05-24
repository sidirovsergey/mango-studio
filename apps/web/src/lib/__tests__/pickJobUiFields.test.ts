import { describe, expect, it } from 'vitest';
import { type MediaJobUiRow, pickJobUiFields } from '../pickJobUiFields';

describe('pickJobUiFields', () => {
  it('strips internal fields and keeps UI fields', () => {
    const full = {
      id: 'job-1',
      project_id: 'p-1',
      scene_id: 's-1',
      character_id: null,
      kind: 'video',
      status: 'pending',
      error_code: null,
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:01Z',
      retry_count: 0,
      delayed_until: null,
      // Internal fields the UI must not see:
      fal_request_id: 'fal-xxx',
      model: 'seedance-2-pro',
      request_input: { secret: 'token' },
      result_storage: { kind: 'fal_passthrough', url: 'https://...' },
      cost_usd: 0.5,
      metadata: { internal: true },
    } as unknown as Parameters<typeof pickJobUiFields>[0];

    const ui: MediaJobUiRow = pickJobUiFields(full);

    expect(ui).toEqual({
      id: 'job-1',
      project_id: 'p-1',
      scene_id: 's-1',
      character_id: null,
      kind: 'video',
      status: 'pending',
      error_code: null,
      created_at: '2026-05-24T00:00:00Z',
      updated_at: '2026-05-24T00:00:01Z',
      retry_count: 0,
      delayed_until: null,
    });
    expect(ui).not.toHaveProperty('fal_request_id');
    expect(ui).not.toHaveProperty('request_input');
    expect(ui).not.toHaveProperty('result_storage');
    expect(ui).not.toHaveProperty('cost_usd');
    expect(ui).not.toHaveProperty('metadata');
  });
});
