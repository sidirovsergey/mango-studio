import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { getServerSupabase } from '@mango/db/server';
import { generateSceneVoiceAction } from './generateSceneVoiceAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeProject = (sceneOverrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'economy', // economy default => seedance v1 lite (no native audio)
  script: {
    title: 'Test',
    master_clip_versions: [],
    master_clip_active_version_id: null,
    narrator_voice: { tts_voice_id: 'narrator-voice-id' },
    characters: [
      {
        id: 'char-1',
        name: 'Alice',
        description: 'A curious girl',
        full_prompt: '',
        appearance: {},
        voice: { tts_voice_id: 'char-voice-id' },
        voice_id: 'char-voice-id',
        voice_label: 'Adam',
        dossier: null,
        reference_images: [],
      },
    ],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 5,
        dialogue: { speaker: 'narrator', text: 'Once upon a time...' },
        character_ids: [],
        audio_mode: 'auto',
        first_frame_versions: [],
        first_frame_active_version_id: null,
        video_versions: [],
        video_active_version_id: null,
        voice_audio_versions: [],
        voice_audio_active_version_id: null,
        last_frame: null,
        final_clip: null,
        ...sceneOverrides,
      },
    ],
  },
});

describe('generateSceneVoiceAction', () => {
  it('rejects when scene has no dialogue', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const projectNoDialogue = makeProject({ dialogue: null });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: projectNoDialogue, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const result = await generateSceneVoiceAction({ project_id: PROJECT_ID, scene_id: 's1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/dialogue/i);
  });

  it('skips when audio_mode resolves to native (latin + native model)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = {
      ...makeProject({
        dialogue: { speaker: 'narrator', text: 'Hello world' },
        audio_mode: 'native', // explicit native
      }),
      tier: 'premium',
    };

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const result = await generateSceneVoiceAction({ project_id: PROJECT_ID, scene_id: 's1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/native audio/i);
  });

  it('uses character voice_id when speaker is a character', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProject({
      dialogue: { speaker: 'char-1', text: 'My name is Alice' },
    });

    const submitVoice = vi.fn().mockResolvedValue({
      fal_request_id: 'req-voice-1',
      model_used: 'fal-ai/elevenlabs/tts/multilingual-v2',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ submitVoice });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-voice-1',
      existing: false,
    });

    const result = await generateSceneVoiceAction({ project_id: PROJECT_ID, scene_id: 's1' });
    expect(result.ok).toBe(true);
    expect(submitVoice).toHaveBeenCalledWith(
      expect.objectContaining({ voice_id: 'char-voice-id' }),
      expect.anything(),
    );
  });

  it('uses narrator tts_voice_id when speaker is narrator', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitVoice = vi.fn().mockResolvedValue({
      fal_request_id: 'req-voice-2',
      model_used: 'fal-ai/elevenlabs/tts/multilingual-v2',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ submitVoice });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-voice-2',
      existing: false,
    });

    const result = await generateSceneVoiceAction({ project_id: PROJECT_ID, scene_id: 's1' });
    expect(result.ok).toBe(true);
    expect(submitVoice).toHaveBeenCalledWith(
      expect.objectContaining({ voice_id: 'narrator-voice-id' }),
      expect.anything(),
    );
  });
});
