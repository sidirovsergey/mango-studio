import { z } from 'zod';

export const ShotSizeSchema = z.enum([
  'extreme_close_up',
  'close_up',
  'medium_close_up',
  'medium',
  'full',
  'wide',
  'extreme_wide',
]);
export type ShotSize = z.infer<typeof ShotSizeSchema>;

export const CameraAngleSchema = z.enum([
  'eye_level',
  'low_angle',
  'high_angle',
  'birds_eye',
  'dutch',
  'over_shoulder',
  'pov',
]);
export type CameraAngle = z.infer<typeof CameraAngleSchema>;

export const CompositionSchema = z.object({
  shot_size: ShotSizeSchema,
  angle: CameraAngleSchema,
  framing_notes: z.string().optional(),
  subject_focus: z.string().optional(),
});
export type Composition = z.infer<typeof CompositionSchema>;

export const CameraMovementKindSchema = z.enum([
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
]);
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
