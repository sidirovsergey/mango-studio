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
const OTHER_CHAR_ID = 'c2ffcc88-0d0c-4ef8-bb6d-6bb9bd380a33';
const RACHEL_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

const makeCharacter = (overrides: Record<string, unknown> = {}) => ({
  id: CHARACTER_ID,
  name: 'Alice',
  description: '',
  full_prompt: '',
  appearance: {},
  personality: '',
  voice: { tts_voice_id: 'pNInz6obpgDQGcFmaJgB', stability: 0.5 },
  dossier: null,
  reference_images: [],
  archived: false,
  ...overrides,
});

const makeScene = (speakerId: string, voiceAudioVersionsCount: number, sceneId = 's1') => ({
  scene_id: sceneId,
  description: 'Test scene',
  duration_sec: 5,
  dialogue: { speaker: speakerId, text: 'Hello' },
  voice_audio_versions: Array.from({ length: voiceAudioVersionsCount }, (_, i) => ({
    version_id: `v${i + 1}`,
    storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/audio.mp3' },
    prompt: null,
    model: 'elevenlabs',
    generated_at: '2026-01-01T00:00:00Z',
    cost_usd: 0.001,
    source: 'auto_continuity',
  })),
});

const makeProject = (
  chars: ReturnType<typeof makeCharacter>[],
  scenes: ReturnType<typeof makeScene>[],
) => ({
  script: {
    title: 'Test',
    characters: chars,
    scenes,
  },
});

const setupSupabase = (project: ReturnType<typeof makeProject> | null) => {
  const single = vi
    .fn()
    .mockResolvedValue(project ? { data: project, error: null } : { data: null, error: 'nf' });
  const eq2 = vi.fn().mockReturnValue({ single });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const updateEq2 = vi.fn().mockResolvedValue({ error: null });
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
  const update = vi.fn().mockReturnValue({ eq: updateEq1 });

  (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: vi.fn(() => ({ select, update })),
  });

  return { update, updateEq1, updateEq2 };
};

describe('setCharacterVoiceAction', () => {
  // 1. Auth fail
  it('returns unauthorized when getCurrentUser throws', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('not logged in'),
    );
    setupSupabase(null);

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toEqual({ ok: false, error: 'unauthorized' });
  });

  // 2. Project not found / wrong user
  it('returns not_found when project does not exist', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    setupSupabase(null);

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  // 3. Character not found
  it('returns character_not_found when character is not in project', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    setupSupabase(makeProject([], []));

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toEqual({ ok: false, error: 'character_not_found' });
  });

  // 4. Happy path — no rendered audio
  it('updates character.voice.tts_voice_id and returns ok when no rendered audio', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const char = makeCharacter();
    const scene = makeScene(CHARACTER_ID, 0);
    const { update } = setupSupabase(makeProject([char], [scene]));

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toEqual({ ok: true, character_id: CHARACTER_ID, tts_voice_id: RACHEL_VOICE_ID });
    expect(update).toHaveBeenCalledOnce();
    const updateArg = update.mock.calls[0]?.[0] as {
      script: { characters: Array<{ voice?: { tts_voice_id?: string; stability?: number } }> };
    };
    expect(updateArg.script.characters[0]?.voice?.tts_voice_id).toBe(RACHEL_VOICE_ID);
  });

  // 5. Voice locked — single scene rendered
  it('returns voice_locked when one scene for this character has rendered audio', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const char = makeCharacter();
    const scene = makeScene(CHARACTER_ID, 1); // 1 rendered version
    const { update } = setupSupabase(makeProject([char], [scene]));

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toMatchObject({ ok: false, error: 'voice_locked' });
    if (!r.ok && r.error === 'voice_locked') {
      expect(r.details).toMatch(/s1/);
    }
    expect(update).not.toHaveBeenCalled();
  });

  // 6. Voice locked — multiple scenes rendered
  it('returns voice_locked (first locked scene) when multiple scenes have rendered audio', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const char = makeCharacter();
    const scene1 = makeScene(CHARACTER_ID, 2, 's1');
    const scene2 = makeScene(CHARACTER_ID, 1, 's2');
    const { update } = setupSupabase(makeProject([char], [scene1, scene2]));

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toMatchObject({ ok: false, error: 'voice_locked' });
    expect(update).not.toHaveBeenCalled();
  });

  // 7. Other character has rendered audio — this character should proceed
  it('succeeds when other character has rendered audio but not this character', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const char = makeCharacter();
    const otherScene = makeScene(OTHER_CHAR_ID, 3, 's1'); // other char has rendered audio
    const myScene = makeScene(CHARACTER_ID, 0, 's2'); // this char has no rendered audio
    const { update } = setupSupabase(makeProject([char], [otherScene, myScene]));

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toEqual({ ok: true, character_id: CHARACTER_ID, tts_voice_id: RACHEL_VOICE_ID });
    expect(update).toHaveBeenCalledOnce();
  });

  // 8. Idempotency — setting same voice_id twice succeeds
  it('succeeds when setting the same voice_id that is already set', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const char = makeCharacter({ voice: { tts_voice_id: RACHEL_VOICE_ID } });
    const scene = makeScene(CHARACTER_ID, 0);
    const { update } = setupSupabase(makeProject([char], [scene]));

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r).toEqual({ ok: true, character_id: CHARACTER_ID, tts_voice_id: RACHEL_VOICE_ID });
    expect(update).toHaveBeenCalledOnce();
  });

  // 9. Preserves voice_settings — stability, similarity_boost, etc. remain intact after update
  it('preserves existing voice_settings fields when updating tts_voice_id', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    const char = makeCharacter({
      voice: {
        tts_voice_id: 'pNInz6obpgDQGcFmaJgB',
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.1,
        speed: 0.9,
      },
    });
    const scene = makeScene(CHARACTER_ID, 0);
    const { update } = setupSupabase(makeProject([char], [scene]));

    const r = await setCharacterVoiceAction({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
      tts_voice_id: RACHEL_VOICE_ID,
    });

    expect(r.ok).toBe(true);
    const updateArg = update.mock.calls[0]?.[0] as {
      script: {
        characters: Array<{
          voice?: {
            tts_voice_id?: string;
            stability?: number;
            similarity_boost?: number;
            style?: number;
            speed?: number;
          };
        }>;
      };
    };
    const updatedVoice = updateArg.script.characters[0]?.voice;
    expect(updatedVoice?.tts_voice_id).toBe(RACHEL_VOICE_ID);
    expect(updatedVoice?.stability).toBe(0.4);
    expect(updatedVoice?.similarity_boost).toBe(0.8);
    expect(updatedVoice?.style).toBe(0.1);
    expect(updatedVoice?.speed).toBe(0.9);
  });
});
