import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import {
  buildAllProspectivePromptsAction,
  buildProspectivePromptAction,
} from './buildProspectivePromptAction';

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function makeProject(scriptOverrides: Record<string, unknown> = {}) {
  return {
    user_id: 'u1',
    tier: 'premium',
    style: '3d_pixar',
    script: {
      title: 'Preview',
      characters: [],
      scenes: [
        {
          scene_id: 'scene-1',
          description: 'A tiny fox waves at the camera.',
          duration_sec: 8,
          dialogue: null,
          character_ids: [],
          first_frame_source: 'manual_text2img',
          first_frame_versions: [],
          first_frame_active_version_id: null,
          video_versions: [],
          video_active_version_id: null,
          last_frame: null,
        },
      ],
      ...scriptOverrides,
    },
  };
}

function mockProject(project: ReturnType<typeof makeProject>) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: project, error: null }),
  };
  (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    from: vi.fn(() => builder),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
});

describe('buildProspectivePromptAction', () => {
  it('uses project tier for first-frame preview when script tier is absent', async () => {
    mockProject(makeProject());

    const result = await buildProspectivePromptAction({
      project_id: PROJECT_ID,
      scene_id: 'scene-1',
      kind: 'first_frame',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe('fal-ai/nano-banana-pro');
    }
  });

  it('uses project tier in batch first-frame previews when script tier is absent', async () => {
    mockProject(makeProject());

    const result = await buildAllProspectivePromptsAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prompts['scene-1']?.first_frame?.model).toBe('fal-ai/nano-banana-pro');
    }
  });
});
