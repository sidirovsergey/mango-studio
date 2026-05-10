import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { setCharacterVoiceAction } from './setCharacterVoiceAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CHARACTER_ID = 'b1ffcc88-0d0c-4ef8-bb6d-6bb9bd380a22';

const makeProject = (chars: Array<Record<string, unknown>> = []) => ({
  script: {
    title: 'Test',
    characters: [
      {
        id: CHARACTER_ID,
        name: 'Alice',
        description: '',
        full_prompt: '',
        appearance: {},
        personality: '',
        voice: {},
        dossier: null,
        reference_images: [],
        archived: false,
        ...chars[0],
      },
    ],
    scenes: [],
  },
});

const setupSupabase = (project: ReturnType<typeof makeProject> | null) => {
  const select = vi.fn().mockReturnThis();
  const eq1 = vi.fn().mockReturnThis();
  const eq2 = vi.fn().mockReturnThis();
  const single = vi
    .fn()
    .mockResolvedValue(project ? { data: project, error: null } : { data: null, error: 'nf' });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });

  const fromMock = vi.fn(() => ({
    select,
    eq: eq1,
    update,
  }));
  // The select chain: .select().eq().eq().single()
  select.mockReturnValue({ eq: eq1 });
  eq1.mockReturnValue({ eq: eq2 });
  eq2.mockReturnValue({ single });

  (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: fromMock,
  });
  return { fromMock, update };
};

describe('setCharacterVoiceAction', () => {
  it('accepts pool voice_id and updates character', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const { update } = setupSupabase(makeProject());

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      voice_id: '21m00Tcm4TlvDq8ikWAM', // Rachel from pool
      voice_label: 'Rachel',
    });

    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalled();
    const updateCall = update.mock.calls[0]?.[0] as {
      script: { characters: Array<{ voice_id?: string; voice_label?: string }> };
    };
    expect(updateCall.script.characters[0]?.voice_id).toBe('21m00Tcm4TlvDq8ikWAM');
    expect(updateCall.script.characters[0]?.voice_label).toBe('Rachel');
  });

  it('rejects voice_id not in pool when advanced=false', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    setupSupabase(makeProject());

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      voice_id: 'unknown-id-xx12345678',
      voice_label: 'Custom',
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/pool/i);
  });

  it('accepts custom voice_id with advanced=true', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const { update } = setupSupabase(makeProject());

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      voice_id: 'AbCdEfGhIjKlMnOpQrSt', // 20-char custom
      voice_label: 'Custom Cloned',
      advanced: true,
    });

    expect(r.ok).toBe(true);
    const updateCall = update.mock.calls[0]?.[0] as {
      script: { characters: Array<{ voice_id?: string; voice_label?: string }> };
    };
    expect(updateCall.script.characters[0]?.voice_id).toBe('AbCdEfGhIjKlMnOpQrSt');
    expect(updateCall.script.characters[0]?.voice_label).toBe('Custom Cloned');
  });
});
