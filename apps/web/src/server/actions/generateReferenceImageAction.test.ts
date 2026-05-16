import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { getServerSupabase } from '@mango/db/server';
import { generateReferenceImageAction } from './generateReferenceImageAction';

beforeEach(() => {
  vi.resetAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CHARACTER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeCharacter = (overrides: Record<string, unknown> = {}) => ({
  id: CHARACTER_ID,
  name: 'Дэнни',
  description: 'Весёлый дельфин',
  full_prompt: 'Detailed appearance: blue fins',
  appearance: { species: 'dolphin', age: '10', build: 'slim', distinctive: ['glasses'] },
  personality: 'Оптимист',
  voice: {},
  dossier: null,
  reference_images: [],
  ...overrides,
});

const makeProject = (overrides: Record<string, unknown> = {}, charOverrides = {}) => ({
  tier: 'economy',
  style: '3d_pixar',
  script: {
    characters: [makeCharacter(charOverrides)],
    scenes: [],
  },
  ...overrides,
});

function makeSupabase(project: unknown) {
  // The `from('projects').select().eq().eq().single()` chain returns the project.
  // The `from('media_jobs').select().eq().eq().eq().in().limit().maybeSingle()` chain
  // is the pre-submit idempotency query and returns null (no active job).
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: project, error: null }),
    update: vi.fn().mockReturnThis(),
  };
  return {
    from: vi.fn(() => builder),
    _builder: builder,
  };
}

// ---------------------------------------------------------------------------
// 1. Auth failure
// ---------------------------------------------------------------------------

describe('generateReferenceImageAction — auth', () => {
  it('returns error when not authenticated', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Unauthorized'),
    );
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSupabase(makeProject()),
    );

    const result = await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unauthorized/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Ownership check
// ---------------------------------------------------------------------------

describe('generateReferenceImageAction — ownership', () => {
  it('returns error when project not found / wrong user', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const result = await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/project not found/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Wrong character_id
// ---------------------------------------------------------------------------

describe('generateReferenceImageAction — character lookup', () => {
  it('returns error for unknown character_id', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const sb = makeSupabase(makeProject());
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const result = await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', // wrong UUID
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/character not found/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotency — already exists
// ---------------------------------------------------------------------------

describe('generateReferenceImageAction — idempotency', () => {
  it('returns already_exists without calling fal when reference_image is set', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const existingRef = { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/ref.png' };
    const charWithRef = makeCharacter({
      dossier: {
        storage: existingRef,
        reference_image: existingRef,
        model: 'fal-ai/nano-banana-2',
        format: '16:9',
        quality: '720p',
        generated_at: '2026-01-01T00:00:00Z',
      },
    });
    const sb = makeSupabase(makeProject({}, charWithRef));
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const submitCharacterReferenceImage = vi.fn();
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitCharacterReferenceImage,
    });

    const result = await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.status === 'already_exists') {
      expect(result.existing).toBeDefined();
      expect(result.existing.storage).toEqual(existingRef);
    } else {
      expect.fail('expected already_exists');
    }
    expect(submitCharacterReferenceImage).not.toHaveBeenCalled();
    expect(recordPendingJob).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4b. Precondition — dossier required
// ---------------------------------------------------------------------------

describe('generateReferenceImageAction — precondition', () => {
  it('returns precondition error when character.dossier is null', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    // makeCharacter defaults to dossier: null — no override needed
    const sb = makeSupabase(makeProject({ tier: 'economy' }));
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const submitCharacterReferenceImage = vi.fn();
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitCharacterReferenceImage,
    });

    const result = await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('requires_dossier');
    expect(submitCharacterReferenceImage).not.toHaveBeenCalled();
    expect(recordPendingJob).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Happy path — not yet generated (economy tier)
// ---------------------------------------------------------------------------

const makeDossier = () => ({
  storage: { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/dossier.png' },
  model: 'fal-ai/nano-banana-2',
  format: '16:9',
  quality: '720p',
  generated_at: '2026-01-01T00:00:00Z',
});

describe('generateReferenceImageAction — happy path', () => {
  it('submits fal job and records pending job for economy tier', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const sb = makeSupabase(makeProject({ tier: 'economy' }, { dossier: makeDossier() }));
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const submitCharacterReferenceImage = vi.fn().mockResolvedValue({
      fal_request_id: 'req-ref-1',
      model_used: 'fal-ai/nano-banana-2',
      request_input: { prompt: 'test prompt', aspect_ratio: 'square_hd' },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitCharacterReferenceImage,
    });

    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-ref-1',
      existing: false,
    });

    const result = await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.status === 'pending') {
      expect(result.job.kind).toBe('character_reference_image');
      expect(result.job.request_id).toBe('req-ref-1');
    } else {
      expect.fail('expected pending');
    }

    // Verify fal called with 1:1 aspect ratio
    expect(submitCharacterReferenceImage).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect_ratio: '1:1',
        model: 'fal-ai/nano-banana-2',
        prompt: expect.stringContaining('Дэнни'),
      }),
      expect.objectContaining({ user_id: 'u1' }),
    );

    // Verify recordPendingJob called with correct kind and character_id
    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'character_reference_image',
        character_id: CHARACTER_ID,
        fal_request_id: 'req-ref-1',
        project_id: PROJECT_ID,
      }),
    );
  });

  it('uses nano-banana-pro for premium tier', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const sb = makeSupabase(makeProject({ tier: 'premium' }, { dossier: makeDossier() }));
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const submitCharacterReferenceImage = vi.fn().mockResolvedValue({
      fal_request_id: 'req-ref-premium',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitCharacterReferenceImage,
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-ref-premium',
      existing: false,
    });

    const result = await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    expect(result.ok).toBe(true);
    expect(submitCharacterReferenceImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'fal-ai/nano-banana-pro' }),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Prompt content sanity check
// ---------------------------------------------------------------------------

describe('generateReferenceImageAction — prompt content', () => {
  it('prompt contains character name, Pure white background, and 1:1', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const sb = makeSupabase(makeProject({ tier: 'economy' }, { dossier: makeDossier() }));
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const submitCharacterReferenceImage = vi.fn().mockResolvedValue({
      fal_request_id: 'req-prompt-check',
      model_used: 'fal-ai/nano-banana-2',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitCharacterReferenceImage,
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'j-prompt',
      existing: false,
    });

    await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    const call = (submitCharacterReferenceImage as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { prompt: string },
      unknown,
    ];
    const prompt = call[0].prompt;

    expect(prompt).toContain('Дэнни');
    expect(prompt).toContain('Pure white background');
    expect(prompt).toContain('1:1');
  });
});

// ---------------------------------------------------------------------------
// 7. recordPendingJob called with correct data
// ---------------------------------------------------------------------------

describe('generateReferenceImageAction — recordPendingJob', () => {
  it('records job with user_id, project_id, character_id, kind, model, fal_request_id', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-abc',
    });

    const sb = makeSupabase(makeProject({ tier: 'economy' }, { dossier: makeDossier() }));
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitCharacterReferenceImage: vi.fn().mockResolvedValue({
        fal_request_id: 'req-record-check',
        model_used: 'fal-ai/nano-banana-2',
        request_input: { prompt: 'x', aspect_ratio: '1:1' },
      }),
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-record',
      existing: false,
    });

    await generateReferenceImageAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });

    expect(recordPendingJob).toHaveBeenCalledWith({
      user_id: 'user-abc',
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      kind: 'character_reference_image',
      model: 'fal-ai/nano-banana-2',
      fal_request_id: 'req-record-check',
      request_input: { prompt: 'x', aspect_ratio: '1:1' },
    });
  });
});
