import type { VisualTheme } from '../media/cinematography-schemas';
import type {
  Dialogue,
  FirstFrameSource,
  MasterClip,
  SceneAsset,
  SceneVideoAsset,
  VoiceAsset,
} from '../media/scene-types';
import type { AspectRatio, StyleName } from '../prompt/types';
import type { Character } from './types';

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  /** Reasoning/thinking tokens used (set when extendedThinking is enabled). */
  reasoning_tokens?: number;
  cost_usd: number;
  model: string;
  latency_ms: number;
}

export interface ScriptGenInput {
  user_prompt: string;
  format: AspectRatio;
  duration_sec: number;
  style: StyleName;
  /** Existing active characters to pass as context for character-aware generation */
  existingCharacters?: Array<{ id: string; name: string; description: string }>;
  /** Project-level tier; controls engine_constraints in the script prompt. Defaults to 'economy'. */
  tier?: 'economy' | 'premium';
  /** F24 fix: existing visual_theme for refine flows — preserves visual consistency across regens. Pass null/undefined on first gen. */
  existing_visual_theme?: VisualTheme | null;
}

export interface Scene {
  scene_id: string;
  description: string;
  duration_sec: number;
  dialogue: Dialogue | null;
  character_ids: string[];
  first_frame_source: FirstFrameSource;
  first_frame: SceneAsset | null;
  last_frame: SceneAsset | null;
  video: SceneVideoAsset | null;
  voice_audio: VoiceAsset | null;
  final_clip: SceneAsset | null;
}

export interface NarratorVoice {
  tts_voice_id: string;
  description?: string;
}

export interface ScriptGenOutput {
  title: string;
  scenes: Scene[];
  characters: Array<
    | { action: 'keep'; id: string }
    | {
        action: 'add';
        name: string;
        description: string;
        appearance?: Record<string, unknown>;
        personality?: string;
      }
    | { action: 'remove'; id: string }
  >;
  narrator_voice?: NarratorVoice;
  master_clip: MasterClip | null;
  /**
   * Visual theme authored by the LLM at script-gen time. Drives the
   * downstream video-prompt [AESTHETIC] / [Pacing/Style] / Avoid blocks.
   * Codex audit P1.1 fix: previously dropped on persistence, now flows
   * through generateScriptAction → projects.script jsonb.
   */
  visual_theme?: VisualTheme | null;
  /**
   * Tier authored by the LLM at script-gen time. Owns the visual_theme
   * for the whole script (vs scene.config_overrides.tier which can locally
   * override media-gen tier on a per-scene basis). Codex audit P2 fix:
   * previously dropped, so buildProspectivePromptAction and
   * generateSceneVideoAction always fell back to project.tier and
   * effectively rendered visual_theme as if economy.
   */
  tier?: 'economy' | 'premium' | null;
}

export interface RefineSceneInput {
  scene_id: string;
  current: string;
  instruction: string;
}

export interface RefineSceneOutput {
  updated_description: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatInput {
  messages: ChatMessage[];
  /**
   * When 'ephemeral', attaches Anthropic's cache_control marker to the system
   * message so the static prompt prefix is eligible for prompt caching (F86).
   * Default: no caching.
   */
  cacheControl?: 'ephemeral' | 'none';
  /**
   * When set, enables Anthropic's extended thinking (F87).
   * Passed as `thinking: { type: 'enabled', budget_tokens: N }` in the
   * OpenRouter request body (provider pass-through to Anthropic).
   * budget_tokens range: 1024–8192.
   */
  extendedThinking?: { budget_tokens: number };
}

export interface ChatOutput {
  reply: string;
}

/**
 * The shape stored in DB after diff-merge has been applied.
 * characters is a full Character[] (not ScriptCharacterAction[]).
 */
export interface PersistedScript {
  title: string;
  scenes: Scene[];
  characters: Character[];
  narrator_voice?: NarratorVoice;
  master_clip: MasterClip | null;
  /** Visual theme authored at script-gen time. Present after initial generation. */
  visual_theme?: VisualTheme | null;
  /**
   * Script-level tier (owns visual_theme). Distinct from scene.config_overrides.tier
   * which can locally override media-gen tier. Persisted after Codex audit P2 fix.
   */
  tier?: 'economy' | 'premium' | null;
}

export interface ScriptGenResult {
  output: ScriptGenOutput;
  usage: LLMUsage;
}
export interface RefineSceneResult {
  output: RefineSceneOutput;
  usage: LLMUsage;
}
export interface ChatResult {
  output: ChatOutput;
  usage: LLMUsage;
}

export interface LLMProvider {
  generateScript(input: ScriptGenInput): Promise<ScriptGenResult>;
  refineScene(input: RefineSceneInput): Promise<RefineSceneResult>;
  chat(input: ChatInput): Promise<ChatResult>;
}
