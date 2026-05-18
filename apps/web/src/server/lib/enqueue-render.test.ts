import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn(),
  getServiceRoleSupabase: vi.fn(),
}));

vi.mock('@/server/actions/generateSceneVideoAction', () => ({
  generateSceneVideoAction: vi.fn(),
}));

vi.mock('@/server/actions/generateMasterClipAction', () => ({
  generateMasterClipAction: vi.fn(),
}));

import { generateMasterClipAction } from '@/server/actions/generateMasterClipAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import { getServerSupabase, getServiceRoleSupabase } from '@mango/db/server';
import { enqueueRenderForProject } from './enqueue-render';

const PROJECT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const INTENT_ID = 'f1e2d3c4-b5a6-4d7e-9f8a-1b2c3d4e5f6a';

function mockProject(script: { scenes: Array<{ scene_id: string }> } | null) {
  const single = vi.fn().mockResolvedValue({
    data: script ? { user_id: 'u1', script } : null,
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { auth: {}, from };
}

function mockServiceRpc() {
  return { rpc: vi.fn().mockResolvedValue({ error: null }) };
}

describe('enqueueRenderForProject', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('project_not_found → error result, no actions called', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockProject(null),
    );
    const r = await enqueueRenderForProject({ intent_id: INTENT_ID, project_id: PROJECT_ID });
    expect(r.ok).toBe(false);
    expect(r.master_error).toBe('project_not_found');
    expect(generateSceneVideoAction).not.toHaveBeenCalled();
  });

  it('project_has_no_scenes when script is empty', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockProject({ scenes: [] }),
    );
    const r = await enqueueRenderForProject({ intent_id: INTENT_ID, project_id: PROJECT_ID });
    expect(r.ok).toBe(false);
    expect(r.master_error).toBe('project_has_no_scenes');
  });

  it('happy path: 3 scenes reserved + master + intent consumed', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockProject({
        scenes: [{ scene_id: 's1' }, { scene_id: 's2' }, { scene_id: 's3' }],
      }),
    );
    const svc = mockServiceRpc();
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(svc);

    (generateSceneVideoAction as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, job_id: 'j1', existing: false, audio_mode: 'native' })
      .mockResolvedValueOnce({ ok: true, job_id: 'j2', existing: false, audio_mode: 'native' })
      .mockResolvedValueOnce({ ok: true, job_id: 'j3', existing: false, audio_mode: 'native' });
    (generateMasterClipAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      job_id: 'jm',
      existing: false,
    });

    const r = await enqueueRenderForProject({ intent_id: INTENT_ID, project_id: PROJECT_ID });

    expect(r.ok).toBe(true);
    expect(r.scene_job_ids).toEqual(['j1', 'j2', 'j3']);
    expect(r.master_job_id).toBe('jm');
    expect(r.intent_consumed).toBe(true);
    expect(svc.rpc).toHaveBeenCalledWith('fn_mark_intent_consumed', {
      p_intent_id: INTENT_ID,
    });
  });

  it('partial scene failure: master skipped, intent NOT consumed', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockProject({ scenes: [{ scene_id: 's1' }, { scene_id: 's2' }] }),
    );
    const svc = mockServiceRpc();
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(svc);

    (generateSceneVideoAction as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, job_id: 'j1', existing: false, audio_mode: 'native' })
      .mockResolvedValueOnce({ ok: false, error: 'insufficient_balance' });

    const r = await enqueueRenderForProject({ intent_id: INTENT_ID, project_id: PROJECT_ID });

    expect(r.ok).toBe(false);
    expect(r.scene_job_ids).toEqual(['j1']);
    expect(r.scene_errors).toEqual([{ scene_id: 's2', error: 'insufficient_balance' }]);
    expect(r.master_error).toBe('skipped_due_to_scene_errors');
    expect(r.intent_consumed).toBe(false);
    expect(generateMasterClipAction).not.toHaveBeenCalled();
    expect(svc.rpc).not.toHaveBeenCalled();
  });

  it('all scenes ok but master_clip fails → intent NOT consumed', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockProject({ scenes: [{ scene_id: 's1' }] }),
    );
    const svc = mockServiceRpc();
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(svc);

    (generateSceneVideoAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      job_id: 'j1',
      existing: false,
      audio_mode: 'native',
    });
    (generateMasterClipAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: 'insufficient_balance',
    });

    const r = await enqueueRenderForProject({ intent_id: INTENT_ID, project_id: PROJECT_ID });

    expect(r.ok).toBe(false);
    expect(r.scene_job_ids).toEqual(['j1']);
    expect(r.master_error).toBe('insufficient_balance');
    expect(r.intent_consumed).toBe(false);
    expect(svc.rpc).not.toHaveBeenCalled();
  });

  it('fn_mark_intent_consumed RPC error: jobs still enqueued, intent_consumed=false, logs error', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockProject({ scenes: [{ scene_id: 's1' }] }),
    );
    const svc = { rpc: vi.fn().mockResolvedValue({ error: { message: 'auth.uid() null' } }) };
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(svc);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    (generateSceneVideoAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      job_id: 'j1',
      existing: false,
      audio_mode: 'native',
    });
    (generateMasterClipAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      job_id: 'jm',
      existing: false,
    });

    const r = await enqueueRenderForProject({ intent_id: INTENT_ID, project_id: PROJECT_ID });

    expect(r.ok).toBe(true);
    expect(r.scene_job_ids).toEqual(['j1']);
    expect(r.master_job_id).toBe('jm');
    expect(r.intent_consumed).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(
      '[enqueueRenderForProject] fn_mark_intent_consumed failed',
      expect.objectContaining({ intent_id: INTENT_ID }),
    );
  });
});
