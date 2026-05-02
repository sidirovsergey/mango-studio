import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getServerSupabase } from '@mango/db/server';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { generateSceneVoiceAction } from './generateSceneVoiceAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeProject = (sceneOverrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  script: {
    title: 'Test',
    master_clip: null,
    narrator_voice: { tts_voice_id: 'narrator-voice-id' },
    characters: [
      {
        id: 'char-1',
        name: 'Alice',
        description: 'A curious girl',
        full_prompt: '',
        appearance: {},
        voice: { tts_voice_id: 'char-voice-id' },
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
        first_frame: null,
        last_frame: null,
        video: null,
        voice_audio: null,
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
    if (!result.ok) {
      expect(result.error).toMatch(/dialogue/i);
    }
  });

  it('submits TTS for narrator dialogue and records job', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const DEFAULT_VOICE_MODEL = 'fal-ai/elevenlabs/tts/multilingual-v2';

    const submitVoice = vi.fn().mockResolvedValue({
      fal_request_id: 'req-voice-1',
      model_used: DEFAULT_VOICE_MODEL,
      request_input: { text: 'Once upon a time...', voice_id: 'narrator-voice-id' },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitVoice,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
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
    if (result.ok) {
      expect(result.job_id).toBe('job-voice-1');
    }

    expect(submitVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Once upon a time...',
        voice_id: 'narrator-voice-id',
        tts_provider_model: DEFAULT_VOICE_MODEL,
      }),
      expect.objectContaining({ user_id: 'u1', project_id: PROJECT_ID }),
    );

    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        project_id: PROJECT_ID,
        scene_id: 's1',
        kind: 'voice',
        fal_request_id: 'req-voice-1',
      }),
    );
  });
});
