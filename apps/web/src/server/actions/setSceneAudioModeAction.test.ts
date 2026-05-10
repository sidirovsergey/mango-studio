import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { setSceneAudioModeAction } from './setSceneAudioModeAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function buildSb(scriptIn: unknown) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const projectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: PROJECT_ID, user_id: 'u1', script: scriptIn },
      error: null,
    }),
  };
  return {
    sb: { from: vi.fn(() => ({ ...projectQuery, update })) },
    update,
  };
}

describe('setSceneAudioModeAction', () => {
  it('sets audio_mode for each of native|silent_tts|auto', async () => {
    for (const mode of ['native', 'silent_tts', 'auto'] as const) {
      (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
      const script = { scenes: [{ scene_id: 's1' }] };
      const { sb, update } = buildSb(script);
      (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

      const r = await setSceneAudioModeAction({
        project_id: PROJECT_ID,
        scene_id: 's1',
        audio_mode: mode,
      });
      expect(r.ok).toBe(true);
      const payload = update.mock.calls[0]?.[0];
      expect(payload?.script?.scenes[0]?.audio_mode).toBe(mode);
    }
  });
});
