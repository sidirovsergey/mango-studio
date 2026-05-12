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
  description_en?: string | null;
  duration_sec: number;
  dialogue: Dialogue | null;
  composition?: Composition | null;
  camera_movement?: CameraMovement | null;
  lighting?: Lighting | null;
  audio_direction?: AudioDirection | null;
  arc_role?: ArcRole | null;
}

export interface CharacterInScene {
  id: string;
  name: string;
  description: string;
}

export interface VideoPromptInput {
  model: string;
  scene: VideoPromptSceneInput;
  first_frame_storage: StoredAsset;
  audio_mode: AudioMode;
  characters_in_scene?: CharacterInScene[];
  visual_theme?: VisualTheme | null;
  tier?: 'economy' | 'premium' | null;
}

export interface VideoPromptOutput {
  prompt: string;
  image_refs: StoredAsset[];
  duration_sec: number;
  aspect_ratio: '9:16';
}
