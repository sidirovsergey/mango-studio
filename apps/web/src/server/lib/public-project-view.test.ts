import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({
  getServiceRoleSupabase: vi.fn(),
}));

import { getServiceRoleSupabase } from '@mango/db/server';
import { toPublicProjectView } from './public-project-view';

/**
 * Phase 1.8.1 — leak-prevention tests for the public route's service_role
 * boundary. Every test below asserts that a known-sensitive field is NOT
 * present anywhere in the JSON-serialised mapper output. If a future
 * refactor accidentally widens the allowlist, these tests fail loud.
 */

const SENSITIVE_FIELDS = [
  'user_id',
  'idea',
  'tier',
  'cost_usd',
  'fal_request_id',
  'request_input',
  'result_storage',
  'email',
  'auth',
  'password',
  'config_overrides',
  'tier_at_gen',
];

function makeServiceRoleMock() {
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://cdn.example/signed' },
    error: null,
  });
  return {
    from: vi.fn().mockReturnValue({}),
    storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    _createSignedUrl: createSignedUrl,
  };
}

/**
 * "Kitchen-sink" fixture (Codex audit fix #2): every sensitive field
 * present with a unique sentinel value. If ANY sentinel survives the
 * mapper into the JSON-serialised output, the corresponding leak test
 * fails — proves the allowlist works on every named field, not just on
 * fields that happen to appear in a benign fixture.
 */
const SECRET_PROJECT_ROW = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  public_slug: 'aB3xKp9q2L',
  title: 'Cat Story',
  status: 'storyboard_ready',
  format: '16:9',
  target_duration_sec: 60,
  created_at: '2026-05-19T10:00:00Z',
  tier: 'economy',
  user_id: 'SENTINEL-USER-UUID',
  idea: 'SENTINEL-IDEA-PROMPT',
  // Sensitive top-level fields that COULD be added via future `select *`.
  // Each carries a unique sentinel value the leak tests grep for.
  email: 'SENTINEL-EMAIL@example.test',
  auth: 'SENTINEL-AUTH-TOKEN',
  password: 'SENTINEL-PASSWORD',
  cost_usd: 'SENTINEL-COST-USD',
  fal_request_id: 'SENTINEL-FAL-REQ-ID',
  request_input: 'SENTINEL-REQUEST-INPUT',
  result_storage: 'SENTINEL-RESULT-STORAGE',
  script: {
    scenes: [
      {
        scene_id: 's1',
        description: 'A cat enters.',
        description_ru: 'Кот входит.',
        description_en: 'A cat enters the room.',
        duration_sec: 8,
        dialogue: { speaker: 'cat', text: 'Hi!' },
        character_ids: ['cat'],
        arc_role: 'hook',
        config_overrides: { tier: 'premium', model: 'SENTINEL-MODEL-ID' },
        tier_at_gen: 'premium',
        // Nested sensitives — even deeper than top-level.
        cost_usd: 'SENTINEL-NESTED-COST',
        fal_request_id: 'SENTINEL-NESTED-FAL-ID',
        first_frame_versions: [
          {
            version_id: 'v1',
            storage: { kind: 'fal_passthrough', url: 'https://cdn.fal/img1.jpg' },
            // Even at the deepest level, sensitives must not leak.
            fal_request_id: 'SENTINEL-DEEP-FAL-ID',
            request_input: 'SENTINEL-DEEP-REQUEST',
          },
        ],
        first_frame_active_version_id: 'v1',
      },
    ],
    characters: [],
  },
};

describe('toPublicProjectView — security allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeServiceRoleMock(),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('happy path: returns expected public fields', async () => {
    const view = await toPublicProjectView(SECRET_PROJECT_ROW);
    expect(view).not.toBeNull();
    expect(view?.id).toBe(SECRET_PROJECT_ROW.id);
    expect(view?.public_slug).toBe('aB3xKp9q2L');
    expect(view?.title).toBe('Cat Story');
    expect(view?.scenes_count).toBe(1);
    expect(view?.scenes[0]?.narrative_paragraph).toBe('Кот входит.');
    expect(view?.scenes[0]?.first_frame_url).toBe('https://cdn.fal/img1.jpg');
  });

  it.each(SENSITIVE_FIELDS)(
    'does not leak sensitive field "%s" anywhere in output',
    async (field) => {
      const view = await toPublicProjectView(SECRET_PROJECT_ROW);
      const serialised = JSON.stringify(view);
      expect(serialised).not.toContain(`"${field}"`);
    },
  );

  it.each([
    'SENTINEL-USER-UUID',
    'SENTINEL-IDEA-PROMPT',
    'SENTINEL-EMAIL@example.test',
    'SENTINEL-AUTH-TOKEN',
    'SENTINEL-PASSWORD',
    'SENTINEL-COST-USD',
    'SENTINEL-FAL-REQ-ID',
    'SENTINEL-REQUEST-INPUT',
    'SENTINEL-RESULT-STORAGE',
    'SENTINEL-MODEL-ID',
    'SENTINEL-NESTED-COST',
    'SENTINEL-NESTED-FAL-ID',
    'SENTINEL-DEEP-FAL-ID',
    'SENTINEL-DEEP-REQUEST',
  ])(
    'sentinel-value leak guard: "%s" must not appear anywhere in serialised view (Codex audit fix)',
    async (sentinel) => {
      const view = await toPublicProjectView(SECRET_PROJECT_ROW);
      const serialised = JSON.stringify(view);
      expect(serialised).not.toContain(sentinel);
    },
  );

  it('output keys are exactly the documented PublicProjectView allowlist', async () => {
    const view = await toPublicProjectView(SECRET_PROJECT_ROW);
    expect(view).not.toBeNull();
    if (!view) return;
    const projectKeys = Object.keys(view).sort();
    expect(projectKeys).toEqual(
      [
        'id',
        'public_slug',
        'title',
        'status',
        'format',
        'target_duration_sec',
        'created_at',
        'scenes',
        'scenes_count',
        'price',
      ].sort(),
    );

    const sceneKeys = Object.keys(view.scenes[0] ?? {}).sort();
    expect(sceneKeys).toEqual(
      [
        'scene_id',
        'duration_sec',
        'narrative_paragraph',
        'dialogue',
        'shots',
        'first_frame_url',
        'arc_role',
      ].sort(),
    );

    const shotKeys = Object.keys(view.scenes[0]?.shots[0] ?? {}).sort();
    expect(shotKeys).toEqual(['shot_id', 'image_prompt'].sort());

    const dialogueKeys =
      view.scenes[0]?.dialogue.length && view.scenes[0]?.dialogue[0]
        ? Object.keys(view.scenes[0].dialogue[0]).sort()
        : [];
    expect(dialogueKeys).toEqual(['speaker', 'text'].sort());

    const priceKeys = Object.keys(view.price).sort();
    expect(priceKeys).toEqual(['render_kopeks', 'render_modifiers'].sort());
  });

  it('returns null when script is missing (defensive — never throw)', async () => {
    const view = await toPublicProjectView({ ...SECRET_PROJECT_ROW, script: null });
    expect(view).toBeNull();
  });

  it('returns null when script malformed (defensive — never throw)', async () => {
    const view = await toPublicProjectView({
      ...SECRET_PROJECT_ROW,
      script: { scenes: 'not-an-array' },
    });
    expect(view).toBeNull();
  });

  it('aggregate price precomputed; no raw tier exposed', async () => {
    const view = await toPublicProjectView(SECRET_PROJECT_ROW);
    expect(view?.price).toBeDefined();
    expect(Number.isInteger(view?.price.render_kopeks)).toBe(true);
    // Modifier names DO mention tier — that's the human-readable
    // breakdown like "scene_video × 1 (economy)". Acceptable, not sensitive.
    expect(view?.price.render_modifiers.length).toBeGreaterThan(0);
  });

  it('dialogue is normalised to array even for legacy single shape', async () => {
    const view = await toPublicProjectView(SECRET_PROJECT_ROW);
    expect(Array.isArray(view?.scenes[0]?.dialogue)).toBe(true);
    expect(view?.scenes[0]?.dialogue.length).toBe(1);
  });

  it('shots is always ≥1 (synthesised when absent)', async () => {
    const view = await toPublicProjectView(SECRET_PROJECT_ROW);
    expect(view?.scenes[0]?.shots.length).toBeGreaterThanOrEqual(1);
  });

  it('supabase-storage first_frame resolves to signed URL', async () => {
    const view = await toPublicProjectView({
      ...SECRET_PROJECT_ROW,
      script: {
        scenes: [
          {
            ...SECRET_PROJECT_ROW.script.scenes[0],
            first_frame_versions: [
              {
                version_id: 'v1',
                storage: { kind: 'supabase', path: 'user/scene/v1.png' },
              },
            ],
          },
        ],
        characters: [],
      },
    });
    expect(view?.scenes[0]?.first_frame_url).toBe('https://cdn.example/signed');
  });
});
