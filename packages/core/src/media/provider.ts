import 'server-only';
import type { Tier } from '../tier/types';
import type { CharacterDescriptor, ProjectBible, SceneIntent } from '../prompt/types';

export interface CharacterSheetInput {
  character: CharacterDescriptor;
  bible: ProjectBible;
  tier: Tier;
}

export interface CharacterSheetOutput {
  reference_image_urls: string[];
  cost_usd: number;
  latency_ms: number;
}

export interface SceneGenInput {
  intent: SceneIntent;
  bible: ProjectBible;
  tier: Tier;
}

export interface SceneGenOutput {
  video_url: string;
  poster_url: string;
  end_frame_url: string;
  duration_sec: number;
  cost_usd: number;
  latency_ms: number;
}

export interface MediaProvider {
  generateCharacterSheet(input: CharacterSheetInput): Promise<CharacterSheetOutput>;
  generateScene(input: SceneGenInput): Promise<SceneGenOutput>;
}
