import type {
  ArcRole,
  AudioDirection,
  CameraMovement,
  Composition,
  Lighting,
  VisualTheme,
} from '../cinematography-schemas';
import type { AudioMode, Dialogue } from '../scene-types';
import type { StoredAsset } from '../storage/StorageProvider';

export interface VideoPromptSceneInput {
  scene_id: string;
  description: string;
  description_en?: string;
  duration_sec: number;
  dialogue: Dialogue | null;
  composition?: Composition;
  camera_movement?: CameraMovement;
  lighting?: Lighting;
  audio_direction?: AudioDirection;
  arc_role?: ArcRole;
}

export interface CharacterInScene {
  id: string;
  name: string;
  description: string;
  full_prompt?: string;
}

export interface VideoPromptInput {
  model: string;
  scene: VideoPromptSceneInput;
  first_frame_storage: StoredAsset;
  audio_mode: AudioMode;
  characters_in_scene?: CharacterInScene[];
  visual_theme?: VisualTheme;
  tier?: 'economy' | 'premium';
}

export interface VideoPromptOutput {
  prompt: string;
  image_refs: StoredAsset[];
  duration_sec: number;
  aspect_ratio: '9:16';
}
