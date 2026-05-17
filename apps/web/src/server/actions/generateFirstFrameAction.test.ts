import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({
  recordPendingJob: vi.fn(),
  finalizeMediaJobReservation: vi.fn().mockResolvedValue(undefined),
  rollbackMediaJobReservation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/server/lib/rate-limit', () => ({
  reserveMediaJob: vi.fn().mockResolvedValue({
    ok: true,
    mode: 'reserved' as const,
    job_id: 'reserved-id',
    used: 1,
    dedup: false,
  }),
}));
// The dynamic import of generateReferenceImageAction (F53 hard-precondition) pulls
// in next/cache; stub revalidatePath so the inner action does not throw in test env.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/lib/get-account-tier', () => ({ getAccountTier: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import { finalizeMediaJobReservation } from '@/server/lib/scene-helpers';
import { getAccountTier } from '@/server/lib/get-account-tier';
import { getServerSupabase } from '@mango/db/server';
import { generateAllFirstFramesAction, generateFirstFrameAction } from './generateFirstFrameAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeProject = (sceneOverrides: Record<string, unknown>[] = []) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  style: '3d_pixar',
  script: {
    title: 'Test',
    master_clip: null,
    characters: [
      {
        id: 'char-1',
        name: 'Alice',
        description: 'A test character',
        full_prompt: '',
        appearance: {},
        personality: '',
        voice: {},
        dossier: {
          storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/dossier.jpg' },
          reference_image: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/alice-ref.jpg' },
          model: 'm',
          format: '16:9',
          quality: '1080p',
          generated_at: '2026-01-01',
        },
        reference_images: [],
        archived: false,
      },
    ],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 8,
        dialogue: null,
        character_ids: ['char-1'],
        first_frame_source: 'auto_continuity',
        first_frame: null,
        last_frame: null,
        video: null,
        voice_audio: null,
        final_clip: null,
        ...sceneOverrides[0],
      },
    ],
  },
});

describe('generateFirstFrameAction', () => {
  it('builds prompt + refs and submits job', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-123',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: { prompt: 'Style: 3D Pixar.' },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitFirstFrame,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: makeProject(),
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-1',
      used: 1,
      dedup: false,
    });

    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job_id).toBe('job-1');
      expect(result.existing).toBe(false);
    }

    expect(submitFirstFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('3D Pixar'),
        model: expect.any(String),
        aspect_ratio: '9:16',
        image_refs: expect.arrayContaining([expect.objectContaining({ kind: 'fal_passthrough' })]),
      }),
      expect.objectContaining({ user_id: 'u1', project_id: PROJECT_ID }),
    );

    expect(finalizeMediaJobReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: 'job-1',
        fal_request_id: 'req-123',
      }),
    );
  });

  it('returns existing job_id when same scene+kind already pending', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-456',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitFirstFrame,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: makeProject(),
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    // dedup=true mirrors the unique-violation case in the old recordPendingJob —
    // reservation returns an existing active job's id and we skip the fal submit.
    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-existing',
      used: 0,
      dedup: true,
    });

    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.existing).toBe(true);
      expect(result.job_id).toBe('job-existing');
    }
    expect(submitFirstFrame).not.toHaveBeenCalled();
  });

  it('F53: rejects with retry message when scene char has dossier but no reference_image', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });

    // Strip reference_image from the default character — mimics the chain still in flight.
    const project = makeProject();
    const character = project.script.characters[0]! as {
      dossier: {
        storage: unknown;
        reference_image?: unknown;
        [k: string]: unknown;
      };
    };
    character.dossier.reference_image = undefined;

    const submitFirstFrame = vi.fn();
    const submitCharacterReferenceImage = vi.fn().mockResolvedValue({
      fal_request_id: 'req-ref',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitFirstFrame,
      submitCharacterReferenceImage,
    });
    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-ref',
      used: 1,
      dedup: false,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn(() => builder),
    });

    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Готовлю reference-картинки');
      expect(result.error).toContain('Alice');
    }
    // first-frame fal submit MUST NOT fire while ref is pending.
    expect(submitFirstFrame).not.toHaveBeenCalled();
    // Whether the inner generateReferenceImageAction actually fires the fal submit
    // depends on its own idempotency state; that path is covered exhaustively in
    // generateReferenceImageAction.test.ts. Here we only assert that first_frame
    // was correctly blocked.
  });

  it('F53: prompt_override bypasses guard AND strips implicit character refs', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    // Character has dossier but no reference_image — guard would normally fire.
    const project = makeProject();
    const character = project.script.characters[0]! as {
      dossier: { storage: unknown; reference_image?: unknown; [k: string]: unknown };
    };
    character.dossier.reference_image = undefined;

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-override-bypass',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitFirstFrame,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-ov-bypass',
      used: 1,
      dedup: false,
    });

    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      prompt_override: 'TEXT-ONLY OVERRIDE — no character refs wanted',
    });

    expect(result.ok).toBe(true);
    expect(submitFirstFrame).toHaveBeenCalledTimes(1);
    const [submitArgs] = (submitFirstFrame as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { prompt: string; image_refs: unknown[] },
      unknown,
    ];
    expect(submitArgs.prompt).toBe('TEXT-ONLY OVERRIDE — no character refs wanted');
    // image_refs must NOT include any character ref — prompt_override skips them entirely.
    expect(submitArgs.image_refs).toEqual([]);
  });

  it('uses prompt_override when provided (skips builder output)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitFirstFrameOverride = vi.fn().mockResolvedValue({
      fal_request_id: 'req-override',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitFirstFrame: submitFirstFrameOverride,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-ov',
      used: 1,
      dedup: false,
    });

    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      prompt_override: 'CUSTOM PROMPT TEXT — override path',
    });

    expect(result.ok).toBe(true);
    expect(submitFirstFrameOverride).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'CUSTOM PROMPT TEXT — override path' }),
      expect.any(Object),
    );
  });

  it('caps at 5 scenes when more in bulk mode', async () => {
    // 7 scenes, bulk should only submit 5
    const scenes = Array.from({ length: 7 }, (_, i) => ({
      scene_id: `s${i + 1}`,
      description: `Scene ${i + 1}`,
      duration_sec: 5,
      dialogue: null,
      character_ids: [],
      first_frame_source: 'auto_continuity',
      first_frame: null,
      last_frame: null,
      video: null,
      voice_audio: null,
      final_clip: null,
    }));

    const projectWith7Scenes = {
      id: PROJECT_ID,
      user_id: 'u1',
      tier: 'premium',
      style: '3d_pixar',
      script: {
        title: 'Test',
        master_clip: null,
        characters: [],
        scenes,
      },
    };

    // Auth called once for the bulk wrapper, then once per individual scene action (5 times)
    // Total 6 calls to getCurrentUser
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-bulk',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitFirstFrame,
    });

    // getServerSupabase called multiple times — once per action
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: projectWith7Scenes,
          error: null,
        }),
      })),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-bulk',
      used: 1,
      dedup: false,
    });

    const result = await generateAllFirstFramesAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job_ids).toHaveLength(5);
      expect(result.capped).toBe(true);
    }
    expect(submitFirstFrame).toHaveBeenCalledTimes(5);
  });
});

// ---------------------------------------------------------------------------
// Phase 1.6 D2 — account-tier capability gate on bulk first-frame path
// ---------------------------------------------------------------------------

describe('generateFirstFrameAction — tier gate on bulk path', () => {
  const makeBulkProject = () => ({
    id: PROJECT_ID,
    user_id: 'u1',
    tier: 'economy',
    style: '3d_pixar',
    script: {
      title: 'Test',
      master_clip: null,
      characters: [],
      scenes: [
        {
          scene_id: 's1',
          description: 'Scene 1',
          duration_sec: 8,
          dialogue: null,
          character_ids: [],
          first_frame_source: 'auto_continuity',
          first_frame: null,
          last_frame: null,
          video: null,
          voice_audio: null,
          final_clip: null,
        },
        {
          scene_id: 's2',
          description: 'Scene 2',
          duration_sec: 8,
          dialogue: null,
          character_ids: [],
          first_frame_source: 'auto_continuity',
          first_frame: null,
          last_frame: null,
          video: null,
          voice_audio: null,
          final_clip: null,
        },
      ],
    },
  });

  it('trial user on bulk path: returns {ok:false, error:"tier_gate"} and never calls submitFirstFrame', async () => {
    // Arrange: trial account tier → should be blocked before fan-out
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('trial');

    const submitFirstFrame = vi.fn();
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ submitFirstFrame });

    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: makeBulkProject(), error: null }),
      })),
    });

    // Act
    const result = await generateAllFirstFramesAction({ project_id: PROJECT_ID });

    // Assert: gate returned, fan-out never fired
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('tier_gate');
      const r = result as { ok: false; error: 'tier_gate'; tier_gate: { required_tier: string; kind: string; message: string } };
      expect(r.tier_gate.required_tier).toBe('free');
      expect(r.tier_gate.kind).toBe('scene_video');
      expect(r.tier_gate.message).toBeTruthy();
    }
    // submitFirstFrame must NOT have been called for any scene
    expect(submitFirstFrame).not.toHaveBeenCalled();
    expect(reserveMediaJob).not.toHaveBeenCalled();
  });

  it('free user (economy model) on bulk path: gate passes and fan-out proceeds', async () => {
    // Arrange: free account tier + economy project tier → allowed
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-bulk-free',
      model_used: 'fal-ai/nano-banana-2',
      request_input: { prompt: 'Scene 1' },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ submitFirstFrame });

    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: makeBulkProject(), error: null }),
      })),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-bulk-free',
      used: 1,
      dedup: false,
    });

    // Act
    const result = await generateAllFirstFramesAction({ project_id: PROJECT_ID });

    // Assert: gate passed, fan-out submitted jobs (2 scenes in makeBulkProject)
    expect(result.ok).toBe(true);
    expect(submitFirstFrame).toHaveBeenCalled();
    expect(reserveMediaJob).toHaveBeenCalledTimes(2);
  });

  it('trial user on single path: no gate, submission proceeds (single path must remain open to all)', async () => {
    // Arrange: trial account tier — single path is image kind, gate NOT applied
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    // getAccountTier should NOT be called on the single path
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('trial');

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-single-trial',
      model_used: 'fal-ai/nano-banana-2',
      request_input: { prompt: 'Scene 1' },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ submitFirstFrame });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeBulkProject(), error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-single-trial',
      used: 1,
      dedup: false,
    });

    // Act: single-path call (mode defaults to 'single', no bulk=true flag)
    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    // Assert: single path proceeds regardless of account tier
    expect(result.ok).toBe(true);
    expect(submitFirstFrame).toHaveBeenCalledTimes(1);
    // getAccountTier must NOT have been called on the single path
    expect(getAccountTier).not.toHaveBeenCalled();
  });
});
