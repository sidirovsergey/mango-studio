import { describe, expect, it } from 'vitest';
import type { CharacterDescriptor, ProjectBible, SceneIntent } from '../prompt/types';
import { MockMediaProvider } from './mock-provider';

const bible: ProjectBible = {
  project_id: 'p1',
  style: { name: '3d_pixar', descriptor: '', palette_hex: [], lighting: '', camera_language: '' },
  world: { setting: '', mood: '' },
  characters: {},
};

const character: CharacterDescriptor = {
  char_id: 'default',
  name: 'Test',
  canonical_description: 'desc',
  short_tag: 'tag',
  reference_image_urls: [],
};

const intent: SceneIntent = {
  scene_id: 'default',
  shot_number: 1,
  duration_sec: 5,
  aspect_ratio: '16:9',
  subject_char_ids: ['default'],
  action: 'test',
  emotion: 'neutral',
  camera: { shot_type: 'medium', movement: 'static', angle: 'eye_level' },
  sound_cues: [],
  transition_in: 'cut',
  transition_out: 'cut',
};

describe('MockMediaProvider', () => {
  it('generateCharacterSheet returns reference URLs from fixtures', async () => {
    const p = new MockMediaProvider();
    const result = await p.generateCharacterSheet({ character, bible, tier: 'economy' });
    expect(result.reference_image_urls).toBeInstanceOf(Array);
    expect(result.reference_image_urls.length).toBeGreaterThan(0);
    expect(result.cost_usd).toBe(0);
  });

  it('generateScene returns video URL from fixtures', async () => {
    const p = new MockMediaProvider();
    const result = await p.generateScene({ intent, bible, tier: 'economy' });
    expect(result.video_url).toBeTruthy();
    expect(result.poster_url).toBeTruthy();
    expect(result.end_frame_url).toBeTruthy();
    expect(result.duration_sec).toBe(5);
  });

  it('premium tier has higher latency than economy', async () => {
    const p = new MockMediaProvider();
    const start1 = Date.now();
    await p.generateScene({ intent, bible, tier: 'economy' });
    const economyMs = Date.now() - start1;

    const start2 = Date.now();
    await p.generateScene({ intent, bible, tier: 'premium' });
    const premiumMs = Date.now() - start2;

    expect(premiumMs).toBeGreaterThan(economyMs);
  }, 15000);

  it('falls back to default fixture for unknown character/scene IDs', async () => {
    const p = new MockMediaProvider();
    const unknownChar = { ...character, char_id: 'nonexistent' };
    const result = await p.generateCharacterSheet({ character: unknownChar, bible, tier: 'economy' });
    expect(result.reference_image_urls).toBeInstanceOf(Array);
  });
});
