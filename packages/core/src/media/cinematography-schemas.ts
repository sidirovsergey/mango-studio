import { z } from 'zod';

// ---------------------------------------------------------------------------
// LLM-output enum coercion
// ---------------------------------------------------------------------------
// Grok 4.1 Fast (and other LLMs) produce cinematography terms from general
// knowledge — `medium_wide`, `push_in`, `closeup`, etc. — that aren't in our
// canonical enum. Without coercion every such drift becomes a 500 on
// script-gen. We map known synonyms at the schema boundary so:
//   - Schema downstream stays canonical (Record<ShotSize, ...> maps unaffected)
//   - LLMs get latitude on common cinematography vocabulary
//   - Genuinely unknown values still fail Zod (surfacing real drift)

const SHOT_SIZE_VALUES = [
  'extreme_close_up',
  'close_up',
  'medium_close_up',
  'medium',
  'full',
  'wide',
  'extreme_wide',
] as const;

const SHOT_SIZE_ALIASES: Record<string, (typeof SHOT_SIZE_VALUES)[number]> = {
  closeup: 'close_up',
  close_up_shot: 'close_up',
  extreme_closeup: 'extreme_close_up',
  extreme_close_up_shot: 'extreme_close_up',
  medium_closeup: 'medium_close_up',
  medium_close_up_shot: 'medium_close_up',
  medium_shot: 'medium',
  full_shot: 'full',
  wide_shot: 'wide',
  extreme_wide_shot: 'extreme_wide',
  // medium_wide / medium_long: real cinematography terms (between medium and
  // wide); our schema only models 7 sizes. Map to nearest neighbour `wide`
  // since these shots favour environment over subject.
  medium_wide: 'wide',
  medium_wide_shot: 'wide',
  medium_long: 'wide',
  medium_long_shot: 'wide',
  long: 'wide',
  long_shot: 'wide',
  extreme_long: 'extreme_wide',
  extreme_long_shot: 'extreme_wide',
};

function coerceShotSize(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  return SHOT_SIZE_ALIASES[val] ?? val;
}

export const ShotSizeSchema = z.preprocess(coerceShotSize, z.enum(SHOT_SIZE_VALUES));
export type ShotSize = z.infer<typeof ShotSizeSchema>;

const CAMERA_ANGLE_VALUES = [
  'eye_level',
  'low_angle',
  'high_angle',
  'birds_eye',
  'dutch',
  'over_shoulder',
  'pov',
] as const;

const CAMERA_ANGLE_ALIASES: Record<string, (typeof CAMERA_ANGLE_VALUES)[number]> = {
  eyelevel: 'eye_level',
  eye_level_shot: 'eye_level',
  low: 'low_angle',
  low_angle_shot: 'low_angle',
  high: 'high_angle',
  high_angle_shot: 'high_angle',
  birds_eye_view: 'birds_eye',
  bird_eye: 'birds_eye',
  bird_eye_view: 'birds_eye',
  top_down: 'birds_eye',
  overhead: 'birds_eye',
  dutch_angle: 'dutch',
  dutch_tilt: 'dutch',
  canted: 'dutch',
  ots: 'over_shoulder',
  over_the_shoulder: 'over_shoulder',
  shoulder: 'over_shoulder',
  point_of_view: 'pov',
  first_person: 'pov',
};

function coerceCameraAngle(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  return CAMERA_ANGLE_ALIASES[val] ?? val;
}

export const CameraAngleSchema = z.preprocess(coerceCameraAngle, z.enum(CAMERA_ANGLE_VALUES));
export type CameraAngle = z.infer<typeof CameraAngleSchema>;

export const CompositionSchema = z.object({
  shot_size: ShotSizeSchema,
  angle: CameraAngleSchema,
  framing_notes: z.string().optional(),
  subject_focus: z.string().optional(),
});
export type Composition = z.infer<typeof CompositionSchema>;

const CAMERA_MOVEMENT_KIND_VALUES = [
  'static',
  'dolly_in',
  'dolly_out',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'tracking',
  'orbit',
  'crane_up',
  'crane_down',
  'whip_pan',
  'handheld',
  'pov_walk',
] as const;

const CAMERA_MOVEMENT_KIND_ALIASES: Record<string, (typeof CAMERA_MOVEMENT_KIND_VALUES)[number]> = {
  // dolly synonyms
  push_in: 'dolly_in',
  push: 'dolly_in',
  dolly: 'dolly_in',
  pull_out: 'dolly_out',
  pull_back: 'dolly_out',
  pull: 'dolly_out',
  push_out: 'dolly_out',
  // zoom often conflated with dolly by AI; subject-relative motion is the
  // semantic the downstream prompt cares about.
  zoom_in: 'dolly_in',
  zoom_out: 'dolly_out',
  // tracking synonyms
  track: 'tracking',
  tracking_shot: 'tracking',
  follow: 'tracking',
  follow_shot: 'tracking',
  // orbit synonyms
  arc: 'orbit',
  circle: 'orbit',
  rotate: 'orbit',
  // crane synonyms
  jib_up: 'crane_up',
  jib_down: 'crane_down',
  boom_up: 'crane_up',
  boom_down: 'crane_down',
  // pov synonyms
  pov: 'pov_walk',
  point_of_view: 'pov_walk',
  first_person: 'pov_walk',
  // whip pan
  whip: 'whip_pan',
  swish_pan: 'whip_pan',
  // handheld
  shaky: 'handheld',
  shaky_cam: 'handheld',
  // static
  fixed: 'static',
  locked: 'static',
  locked_off: 'static',
  none: 'static',
};

function coerceCameraMovementKind(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  return CAMERA_MOVEMENT_KIND_ALIASES[val] ?? val;
}

export const CameraMovementKindSchema = z.preprocess(
  coerceCameraMovementKind,
  z.enum(CAMERA_MOVEMENT_KIND_VALUES),
);
export type CameraMovementKind = z.infer<typeof CameraMovementKindSchema>;

export const CameraMovementSchema = z.object({
  kind: CameraMovementKindSchema,
  speed: z.enum(['slow', 'medium', 'fast']).default('medium'),
  lens_character: z.string().optional(),
});
export type CameraMovement = z.infer<typeof CameraMovementSchema>;

export const LightingSchema = z.object({
  recipe: z.string(),
  time_of_day: z.string().optional(),
  key_direction: z.string().optional(),
});
export type Lighting = z.infer<typeof LightingSchema>;

export const AudioDirectionSchema = z.object({
  ambient: z.string().optional(),
  music: z.string().optional(),
  sfx: z.array(z.string()).optional(),
  voice_notes: z.string().optional(),
});
export type AudioDirection = z.infer<typeof AudioDirectionSchema>;

export const ArcRoleSchema = z.enum(['hook', 'setup', 'rising', 'climax', 'payoff', 'cta', 'beat']);
export type ArcRole = z.infer<typeof ArcRoleSchema>;

export const VisualThemeSchema = z.object({
  palette: z.array(z.string()).min(3).max(6),
  lighting: z.string(),
  lens: z.string(),
  motion: z.string(),
  mood: z.string(),
  film_look: z.string().optional(),
  avoid: z.array(z.string()).optional(),
});
export type VisualTheme = z.infer<typeof VisualThemeSchema>;
