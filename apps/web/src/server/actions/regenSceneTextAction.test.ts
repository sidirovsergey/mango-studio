import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => (modelId: string) => ({ modelId, provider: 'openrouter' }),
}));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { generateText } from 'ai';
import { regenSceneTextAction } from './regenSceneTextAction';

const mockGenerateText = vi.mocked(generateText);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = 'test-key';
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeProject = () => ({
  id: PROJECT_ID,
  user_id: 'u1',
  script: {
    title: 'Test',
    master_clip: null,
    characters: [
      {
        id: 'char-1',
        name: 'Алиса',
        description: 'Главная героиня',
        full_prompt: '',
        appearance: {},
        voice: {},
        dossier: null,
        reference_images: [],
        archived: false,
      },
    ],
    scenes: [
      {
        scene_id: 's1',
        description: 'Алиса бежит по полю',
        duration_sec: 7,
        dialogue: { speaker: 'narrator', text: 'Старая реплика' },
        character_ids: ['char-1'],
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

describe('regenSceneTextAction', () => {
  it('calls generateText and returns parsed dialogue, writes back to script', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProject();
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update: updateFn,
      })),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const newDialogue = { speaker: 'narrator', text: 'Алиса мчится навстречу ветру.' };
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(newDialogue),
      usage: { inputTokens: 100, outputTokens: 20 },
    } as never);

    const result = await regenSceneTextAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      instruction: 'Сделай более поэтичной',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dialogue.speaker).toBe('narrator');
      expect(result.dialogue.text).toBe('Алиса мчится навстречу ветру.');
    }

    expect(mockGenerateText).toHaveBeenCalledOnce();

    // Verify writeback: updateFn was called with updated dialogue
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          scenes: expect.arrayContaining([
            expect.objectContaining({
              dialogue: expect.objectContaining({ text: 'Алиса мчится навстречу ветру.' }),
            }),
          ]),
        }),
      }),
    );
  });

  it('returns error if generateText returns no JSON', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProject();
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      })),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    mockGenerateText.mockResolvedValueOnce({
      text: 'Sorry, I cannot do that.',
      usage: { inputTokens: 50, outputTokens: 10 },
    } as never);

    const result = await regenSceneTextAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no JSON/i);
    }
  });
});
