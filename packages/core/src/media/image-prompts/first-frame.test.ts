import { describe, expect, it, vi } from 'vitest';
import type { CameraMovement, Composition, Lighting, VisualTheme } from '../cinematography-schemas';
import type { Style } from '../prompts';
import type { StoredAsset } from '../storage/StorageProvider';
import { buildFirstFramePrompt } from './first-frame';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dossierfal = { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/dossier.png' };
const refImageFal = { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/ref-image.png' };
const prevLastFrame = { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/last.png' };

const dolphin = {
  id: 'c1',
  name: 'Danny',
  description: 'An optimistic dolphin with round glasses',
  full_prompt: 'A blue 3D Pixar dolphin character',
  dossier: {
    storage: dossierfal,
    reference_image: refImageFal,
    model: 'm',
    format: '16:9' as const,
    quality: '1080p' as const,
    generated_at: '2026-01-01',
  },
  voice: {},
};

const dolphinNoRefImage = {
  id: 'c1',
  name: 'Danny',
  description: 'An optimistic dolphin without ref image',
  full_prompt: '',
  dossier: {
    storage: dossierfal,
    // no reference_image
    model: 'm',
    format: '16:9' as const,
    quality: '1080p' as const,
    generated_at: '2026-01-01',
  },
  voice: {},
};

const crab = {
  id: 'c2',
  name: 'Crabby',
  description: 'A coding crab with a laptop',
  dossier: {
    storage: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/crab.png' },
    reference_image: { kind: 'fal_passthrough' as const, url: 'https://fal.cdn/crab-ref.png' },
    model: 'm',
    format: '16:9' as const,
    quality: '1080p' as const,
    generated_at: '2026-01-01',
  },
  voice: {},
};

const baseScene = {
  scene_id: 's1',
  description: 'Дельфин разговаривает с крабом на пляже',
  description_en: 'Danny the dolphin chats with Crabby on the beach.',
};

const fullComposition = {
  shot_size: 'close_up' as const,
  angle: 'eye_level' as const,
  framing_notes: 'tight on face with bokeh background',
  subject_focus: 'Danny in focus, Crabby blurred',
};

const fullCameraMovement = {
  kind: 'dolly_in' as const,
  speed: 'slow' as const,
  lens_character: '85mm anamorphic lens',
};

const fullLighting = {
  recipe: 'golden hour rim light',
  time_of_day: 'dusk',
  key_direction: 'from upper left',
};

const fullVisualTheme = {
  palette: ['#f0a030', '#b23060', '#2040c0'],
  lighting: 'warm amber fill with cool shadows',
  lens: 'shallow depth of field, 85mm',
  motion: 'slow, dreamlike',
  mood: 'nostalgic and hopeful',
  film_look: 'warm Kodak film grain',
  avoid: ['neon colors', 'harsh contrast', 'desaturated'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SceneOverride {
  scene_id?: string;
  description?: string;
  description_en?: string | null;
  composition?: Composition | null;
  camera_movement?: CameraMovement | null;
  lighting?: Lighting | null;
}

interface CharacterForTest {
  id: string;
  name: string;
  description: string;
  full_prompt?: string;
  dossier?: {
    storage: StoredAsset;
    avatar?: StoredAsset;
    reference_image?: StoredAsset | null;
    model: string;
    format: '16:9';
    quality: '720p' | '1080p' | '2k';
    generated_at: string;
  } | null;
  voice?: { tts_voice_id?: string };
}

interface MakeInputOverrides {
  scene?: SceneOverride;
  characters_in_scene?: CharacterForTest[];
  prev_last_frame?: StoredAsset | null;
  project_style?: Style;
  visual_theme?: VisualTheme | null;
  first_frame_source?: 'auto_continuity' | 'manual_text2img' | 'user_upload';
  // Convenience shorthands — merged into scene
  composition?: Composition | null;
  camera_movement?: CameraMovement | null;
  lighting?: Lighting | null;
}

function makeInput(overrides: MakeInputOverrides = {}) {
  const { composition, camera_movement, lighting, scene: sceneOverride, ...rest } = overrides;

  const scene = {
    ...baseScene,
    ...sceneOverride,
    ...(composition !== undefined ? { composition } : {}),
    ...(camera_movement !== undefined ? { camera_movement } : {}),
    ...(lighting !== undefined ? { lighting } : {}),
  };

  return {
    scene,
    characters_in_scene: [dolphin] as CharacterForTest[],
    prev_last_frame: null as StoredAsset | null,
    project_style: '3d_pixar' as Style,
    first_frame_source: 'manual_text2img' as const,
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildFirstFramePrompt', () => {
  // 1. Shape
  it('returns { prompt: string, image_refs: StoredAsset[] }', () => {
    const out = buildFirstFramePrompt(makeInput());
    expect(typeof out.prompt).toBe('string');
    expect(Array.isArray(out.image_refs)).toBe(true);
  });

  // 2. Uses English description_en when present
  it('uses description_en when present', () => {
    const out = buildFirstFramePrompt(makeInput());
    expect(out.prompt).toContain('Danny the dolphin chats with Crabby on the beach.');
  });

  // 3. Falls back to Russian description when description_en absent
  it('falls back to scene.description when description_en absent', () => {
    const out = buildFirstFramePrompt(
      makeInput({
        scene: { scene_id: 's1', description: 'Дельфин на пляже', description_en: null },
      }),
    );
    expect(out.prompt).toContain('Дельфин на пляже');
    expect(out.prompt).not.toContain('Danny the dolphin chats');
  });

  // 4. Composition emitted when present
  it('emits composition as Title Case when present', () => {
    const out = buildFirstFramePrompt(makeInput({ composition: fullComposition }));
    expect(out.prompt).toContain('Close Up');
    expect(out.prompt).toContain('Eye Level');
  });

  // 5. Composition omitted when absent
  it('omits composition block entirely when absent', () => {
    const out = buildFirstFramePrompt(makeInput({ composition: undefined }));
    // Should NOT have shot_size / angle labels
    expect(out.prompt).not.toContain('Close Up');
    expect(out.prompt).not.toContain('Eye Level');
    // Should NOT emit empty "Composition:" line
    expect(out.prompt).not.toMatch(/Composition:\s*\n/);
  });

  // 6. Composition.framing_notes appears verbatim
  it('includes framing_notes verbatim in composition block', () => {
    const out = buildFirstFramePrompt(makeInput({ composition: fullComposition }));
    expect(out.prompt).toContain('tight on face with bokeh background');
  });

  // 7. Camera movement emitted with verb + speed + lens
  it('emits camera movement with verb, speed, and lens', () => {
    const out = buildFirstFramePrompt(makeInput({ camera_movement: fullCameraMovement }));
    expect(out.prompt).toContain('Dolly In');
    expect(out.prompt).toContain('slow');
    expect(out.prompt).toContain('85mm anamorphic lens');
  });

  // 8. Camera movement omitted when absent
  it('omits camera block when camera_movement absent', () => {
    const out = buildFirstFramePrompt(makeInput({ camera_movement: undefined }));
    expect(out.prompt).not.toContain('Dolly In');
    expect(out.prompt).not.toContain('Camera:');
  });

  // 9. Lighting recipe + time_of_day + key_direction emitted
  it('emits lighting recipe + time_of_day + key_direction when present', () => {
    const out = buildFirstFramePrompt(makeInput({ lighting: fullLighting }));
    expect(out.prompt).toContain('golden hour rim light');
    expect(out.prompt).toContain('dusk');
    expect(out.prompt).toContain('from upper left');
  });

  // 10. Lighting omitted when absent
  it('omits lighting block when absent', () => {
    const out = buildFirstFramePrompt(makeInput({ lighting: undefined }));
    expect(out.prompt).not.toContain('golden hour');
    expect(out.prompt).not.toContain('Lighting:');
  });

  // 11. Visual theme palette as hex strings joined with comma
  it('emits visual theme palette as hex strings', () => {
    const out = buildFirstFramePrompt(makeInput({ visual_theme: fullVisualTheme }));
    expect(out.prompt).toContain('#f0a030');
    expect(out.prompt).toContain('#b23060');
    expect(out.prompt).toContain('#2040c0');
  });

  // 12. Visual theme mood + film_look appear
  it('emits visual theme mood and film_look', () => {
    const out = buildFirstFramePrompt(makeInput({ visual_theme: fullVisualTheme }));
    expect(out.prompt).toContain('nostalgic and hopeful');
    expect(out.prompt).toContain('warm Kodak film grain');
  });

  // 13. Visual theme absent → no palette block
  it('emits no visual theme block when visual_theme absent', () => {
    const out = buildFirstFramePrompt(makeInput({ visual_theme: undefined }));
    expect(out.prompt).not.toContain('Palette:');
    expect(out.prompt).not.toContain('Film look:');
  });

  // 14. Single character: name + description + reference image line
  it('emits single character with name, description, and reference image line', () => {
    const out = buildFirstFramePrompt(makeInput({ characters_in_scene: [dolphin] }));
    expect(out.prompt).toContain('Danny');
    expect(out.prompt).toContain('An optimistic dolphin with round glasses');
    expect(out.prompt).toContain('Reference image attached');
  });

  // 15. Multi-character: names + "Reference images attached"
  it('emits multi-character with both names and "Reference images attached"', () => {
    const out = buildFirstFramePrompt(makeInput({ characters_in_scene: [dolphin, crab] }));
    expect(out.prompt).toContain('Danny');
    expect(out.prompt).toContain('Crabby');
    expect(out.prompt).toContain('Reference images attached');
  });

  // 16. Empty characters_in_scene → "Subject as established" line
  it('emits fallback subject line when characters_in_scene is empty', () => {
    const out = buildFirstFramePrompt(makeInput({ characters_in_scene: [] }));
    expect(out.prompt).toContain('Subject as established in the reference image');
  });

  // 17. character.dossier.reference_image used (not dossier.storage) when both present
  it('uses dossier.reference_image (not dossier.storage) when both present', () => {
    const out = buildFirstFramePrompt(makeInput({ characters_in_scene: [dolphin] }));
    const urls = out.image_refs.map((r) => ('url' in r ? r.url : ''));
    expect(urls).toContain(refImageFal.url);
    expect(urls).not.toContain(dossierfal.url);
  });

  // 18. dossier.storage fallback when reference_image absent, console.warn fires
  it('falls back to dossier.storage when reference_image absent and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = buildFirstFramePrompt(makeInput({ characters_in_scene: [dolphinNoRefImage] }));
    const urls = out.image_refs.map((r) => ('url' in r ? r.url : ''));
    expect(urls).toContain(dossierfal.url);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('c1');
    warnSpy.mockRestore();
  });

  // 19. auto_continuity with prev_last_frame → prev_last_frame is FIRST
  it('puts prev_last_frame first in image_refs for auto_continuity', () => {
    const out = buildFirstFramePrompt(
      makeInput({
        prev_last_frame: prevLastFrame,
        first_frame_source: 'auto_continuity',
      }),
    );
    expect(out.image_refs[0]).toEqual(prevLastFrame);
    // ref_image of dolphin should come second
    expect(out.image_refs[1]).toEqual(refImageFal);
  });

  // 20. REF_LIMIT = 5 cap
  it('caps image_refs at 5', () => {
    const many = [dolphin, crab, dolphin, crab, dolphin, crab];
    const out = buildFirstFramePrompt(makeInput({ characters_in_scene: many }));
    expect(out.image_refs.length).toBeLessThanOrEqual(5);
  });

  // 21. NO "DO NOT replicate" in output
  it('does NOT contain "DO NOT replicate" anywhere', () => {
    const out = buildFirstFramePrompt(makeInput({ characters_in_scene: [dolphin, crab] }));
    expect(out.prompt).not.toContain('DO NOT replicate');
  });

  // 22. NO composition_hint anywhere
  it('does NOT contain "composition_hint" anywhere', () => {
    const out = buildFirstFramePrompt(makeInput());
    expect(out.prompt).not.toContain('composition_hint');
  });

  // 23. NO "undefined" artifact
  it('does NOT contain "undefined" artifact', () => {
    const out = buildFirstFramePrompt(makeInput());
    expect(out.prompt).not.toContain('undefined');
  });

  // 24. Avoid: line always present with default list when visual_theme.avoid absent
  it('always emits Avoid: line with default list when visual_theme has no avoid', () => {
    const themeNoAvoid = { ...fullVisualTheme, avoid: undefined };
    const out = buildFirstFramePrompt(makeInput({ visual_theme: themeNoAvoid }));
    expect(out.prompt).toContain('Avoid:');
    expect(out.prompt).toContain('text in image');
  });

  // 25. visual_theme.avoid override used when non-empty
  it('uses visual_theme.avoid list when non-empty', () => {
    const out = buildFirstFramePrompt(makeInput({ visual_theme: fullVisualTheme }));
    expect(out.prompt).toContain('neon colors');
    expect(out.prompt).toContain('harsh contrast');
    expect(out.prompt).not.toContain('text in image'); // default not present
  });

  // 26. Style preamble appears — uses rich STYLE_PREAMBLE text (Option B)
  it('uses rich STYLE_PREAMBLE for 3d_pixar style (not raw enum key)', () => {
    const out = buildFirstFramePrompt(makeInput({ project_style: '3d_pixar' }));
    // The 3D Pixar preamble contains recognizable Russian text
    expect(out.prompt).toContain('Pixar');
    // Should NOT emit the raw enum key alone as the style line
    // (it's ok if the preamble happens to contain a substring, but should be rich)
    const hasPreamble =
      out.prompt.includes('CGI') ||
      out.prompt.includes('мультяш') ||
      out.prompt.includes('3D Pixar');
    expect(hasPreamble).toBe(true);
  });

  // 27. 9:16 aspect ratio mention present
  it('contains 9:16 aspect ratio mention', () => {
    const out = buildFirstFramePrompt(makeInput());
    expect(out.prompt).toContain('9:16');
  });

  // Bonus: no image_refs when no chars and no prev_last_frame
  it('returns empty image_refs when no chars and no prev_last_frame', () => {
    const out = buildFirstFramePrompt(
      makeInput({ characters_in_scene: [], prev_last_frame: null }),
    );
    expect(out.image_refs).toHaveLength(0);
  });

  // Bonus: subject_focus appears when set
  it('includes subject_focus verbatim in composition block', () => {
    const out = buildFirstFramePrompt(makeInput({ composition: fullComposition }));
    expect(out.prompt).toContain('Danny in focus, Crabby blurred');
  });

  // Bonus: Avoid: line present even when visual_theme entirely absent
  it('Avoid: line present even when no visual_theme at all', () => {
    const out = buildFirstFramePrompt(makeInput({ visual_theme: undefined }));
    expect(out.prompt).toContain('Avoid:');
    expect(out.prompt).toContain('text in image');
  });

  // Bonus: manual_text2img with prev_last_frame → prev_last_frame NOT in refs
  it('does NOT push prev_last_frame when first_frame_source is manual_text2img', () => {
    const out = buildFirstFramePrompt(
      makeInput({
        prev_last_frame: prevLastFrame,
        first_frame_source: 'manual_text2img',
      }),
    );
    expect(out.image_refs).not.toContainEqual(prevLastFrame);
  });

  // Bonus: visual_theme style notes (lighting/lens/motion) appear
  it('emits visual_theme lighting/lens/motion as style notes', () => {
    const out = buildFirstFramePrompt(makeInput({ visual_theme: fullVisualTheme }));
    expect(out.prompt).toContain('warm amber fill with cool shadows');
    expect(out.prompt).toContain('shallow depth of field, 85mm');
    expect(out.prompt).toContain('slow, dreamlike');
  });
});
