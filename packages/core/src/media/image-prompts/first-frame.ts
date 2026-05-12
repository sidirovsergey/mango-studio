import type { CameraMovement, Composition, Lighting, VisualTheme } from '../cinematography-schemas';
import type { Style } from '../prompts';
import type { StoredAsset } from '../storage/StorageProvider';
import { ANGLE_LABEL, CAMERA_VERB, SHOT_SIZE_LABEL } from '../video-prompts/_seedance-shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REF_LIMIT = 5;

// First-frame-specific style preamble (English, optimized for nano-banana).
// Distinct from `STYLE_PREAMBLE` in ../prompts.ts (Russian, used by avatar/dossier builders).
// Two locales exist intentionally — first-frame consumes nano-banana which is English-biased (F50).
const FIRST_FRAME_STYLE_PREAMBLE: Record<Style, string> = {
  '3d_pixar':
    '3D Pixar-style CGI render, soft volumetric lighting, expressive eyes, stylized proportions, detailed textures.',
  '2d_drawn':
    '2D hand-drawn illustration, clean line art, flat color fill, expressive proportions, accent highlights, no shading or textures.',
  clay_art:
    'Clay-art (plasticine) sculpture, visible material texture, soft rounded shapes, subtle finger-press marks on surface, warm studio lighting.',
};

const DEFAULT_AVOID_LIST = [
  'text in image',
  'panels',
  'captions',
  'multiple views',
  'watermarks',
  'signature',
  'color swatches',
  'design notes',
];

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

interface CharacterForFirstFrame {
  id: string;
  name: string;
  description: string;
  full_prompt?: string;
  dossier?: {
    storage: StoredAsset;
    avatar?: StoredAsset;
    reference_image?: StoredAsset | null;
  } | null;
  voice?: { tts_voice_id?: string; description?: string };
}

export interface FirstFramePromptInput {
  scene: {
    scene_id: string;
    description: string;
    description_en?: string | null;
    composition?: Composition | null;
    camera_movement?: CameraMovement | null;
    lighting?: Lighting | null;
  };
  characters_in_scene: CharacterForFirstFrame[];
  prev_last_frame: StoredAsset | null;
  project_style: Style;
  visual_theme?: VisualTheme | null;
  first_frame_source: 'auto_continuity' | 'manual_text2img' | 'user_upload';
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildFirstFramePrompt(input: FirstFramePromptInput): {
  prompt: string;
  image_refs: StoredAsset[];
} {
  const {
    scene,
    characters_in_scene,
    prev_last_frame,
    project_style,
    visual_theme,
    first_frame_source,
  } = input;

  // -------------------------------------------------------------------------
  // [1] Build image_refs
  // -------------------------------------------------------------------------
  const refs: StoredAsset[] = [];

  if (first_frame_source === 'auto_continuity' && prev_last_frame) {
    refs.push(prev_last_frame);
  }

  for (const char of characters_in_scene) {
    if (refs.length >= REF_LIMIT) break;
    if (char.dossier?.reference_image) {
      refs.push(char.dossier.reference_image);
    } else if (char.dossier?.storage) {
      // F53 transitional fallback — single-pose reference_image not yet generated.
      // Log warning once per character so real-world data gaps surface.
      console.warn(
        `[buildFirstFramePrompt] character ${char.id} has no reference_image — falling back to multi-panel dossier.storage (F53 anti-pattern). Generate a reference image to fix.`,
      );
      refs.push(char.dossier.storage);
    }
    // no dossier at all → no ref pushed for this character
  }

  // -------------------------------------------------------------------------
  // [2] Build prompt parts
  // -------------------------------------------------------------------------
  const parts: string[] = [];

  // [1] Style preamble (Option B — resolved from FIRST_FRAME_STYLE_PREAMBLE)
  parts.push(FIRST_FRAME_STYLE_PREAMBLE[project_style]);

  // [2] Output format
  parts.push(
    'OUTPUT FORMAT — single cinematic frame, 9:16 vertical aspect ratio, full bleed, no borders.',
  );

  // [3] Composition (if present)
  if (scene.composition) {
    const comp = scene.composition;
    const shotLabel = SHOT_SIZE_LABEL[comp.shot_size];
    const angleLabel = ANGLE_LABEL[comp.angle];
    const compLines: string[] = [`Composition: ${shotLabel} shot, ${angleLabel} angle.`];
    if (comp.framing_notes) {
      compLines.push(`Framing: ${comp.framing_notes}.`);
    }
    if (comp.subject_focus) {
      compLines.push(`Subject focus: ${comp.subject_focus}.`);
    }
    parts.push(compLines.join(' '));
  }

  // [4] Camera movement (if present — informs framing / lens / depth of field)
  if (scene.camera_movement) {
    const cam = scene.camera_movement;
    const verb = CAMERA_VERB[cam.kind];
    const speedStr = cam.speed ? ` (${cam.speed})` : '';
    const lensStr = cam.lens_character ? `, ${cam.lens_character}` : '';
    parts.push(`Camera: ${verb}${speedStr}${lensStr}.`);
  }

  // [5] Lighting (if present)
  if (scene.lighting) {
    const lit = scene.lighting;
    const lightingLines: string[] = [`Lighting: ${lit.recipe}.`];
    if (lit.time_of_day) {
      lightingLines.push(`Time of day: ${lit.time_of_day}.`);
    }
    if (lit.key_direction) {
      lightingLines.push(`Key direction: ${lit.key_direction}.`);
    }
    parts.push(lightingLines.join(' '));
  }

  // [6] Visual theme (if present)
  if (visual_theme) {
    const themeLines: string[] = [
      `Palette: ${visual_theme.palette.join(', ')}.`,
      `Style notes: ${visual_theme.lighting}, ${visual_theme.lens}, ${visual_theme.motion}.`,
      `Mood: ${visual_theme.mood}.`,
    ];
    if (visual_theme.film_look) {
      themeLines.push(`Film look: ${visual_theme.film_look}.`);
    }
    parts.push(themeLines.join('\n'));
  }

  // [7] Characters in scene
  if (characters_in_scene.length === 0) {
    parts.push('Subject as established in the reference image.');
  } else if (characters_in_scene.length === 1) {
    const char = characters_in_scene[0]!;
    parts.push(`Character in shot: ${char.name} — ${char.description}. Reference image attached.`);
  } else {
    const names = characters_in_scene.map((c) => c.name).join(', ');
    parts.push(
      `Characters in shot: ${names} appearing together, interacting naturally, consistent designs. Reference images attached.`,
    );
  }

  // [8] Scene description (English preferred)
  const sceneDesc = scene.description_en || scene.description;
  parts.push(sceneDesc);

  // [9] Avoid block
  const avoidItems =
    visual_theme?.avoid && visual_theme.avoid.length > 0 ? visual_theme.avoid : DEFAULT_AVOID_LIST;
  parts.push(`Avoid: ${avoidItems.join(', ')}.`);

  return {
    prompt: parts.join('\n\n'),
    image_refs: refs,
  };
}
