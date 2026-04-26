export type StyleName = '3d_pixar' | '2d_drawn' | 'clay_art';
export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface CharacterDescriptor {
  char_id: string;
  name: string;
  canonical_description: string;
  short_tag: string;
  reference_image_urls: string[];
  voice_profile?: {
    elevenlabs_voice_id?: string;
    tone: string;
  };
}

export interface ProjectBible {
  project_id: string;
  style: {
    name: StyleName;
    descriptor: string;
    palette_hex: string[];
    lighting: string;
    camera_language: string;
  };
  world: {
    setting: string;
    mood: string;
  };
  characters: Record<string, CharacterDescriptor>;
}

export interface SceneIntent {
  scene_id: string;
  shot_number: number;
  duration_sec: number;
  aspect_ratio: AspectRatio;

  subject_char_ids: string[];
  action: string;
  emotion: string;

  camera: {
    shot_type: 'close_up' | 'medium' | 'wide' | 'extreme_wide' | 'pov';
    movement: 'static' | 'dolly_in' | 'dolly_out' | 'pan' | 'track' | 'handheld';
    angle: 'eye_level' | 'low' | 'high' | 'dutch';
  };

  dialogue?: { char_id: string; line: string }[];
  sound_cues: string[];
  music_mood?: string;

  transition_in: 'cut' | 'fade' | 'match_cut';
  transition_out: 'cut' | 'fade' | 'match_cut';
  end_frame_requirements?: string;

  start_image_url?: string;
  reference_image_urls?: string[];
}
