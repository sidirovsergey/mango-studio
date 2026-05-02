import type { Dialogue } from './scene-types';
import type { StoredAsset } from './storage/StorageProvider';
import { getVideoModelMeta } from './video-models';

const REF_LIMIT = 5;

interface CharacterForPrompt {
  id: string;
  name: string;
  description: string;
  full_prompt?: string;
  dossier: { storage: StoredAsset } | null;
  voice?: { tts_voice_id?: string; description?: string };
}

interface FirstFramePromptInput {
  scene: { scene_id: string; description: string; composition_hint?: string };
  characters_in_scene: CharacterForPrompt[];
  prev_last_frame: StoredAsset | null;
  project_style: string;
  first_frame_source: 'auto_continuity' | 'manual_text2img' | 'user_upload';
}

export function buildFirstFramePrompt(input: FirstFramePromptInput): {
  prompt: string;
  image_refs: StoredAsset[];
} {
  const { scene, characters_in_scene, prev_last_frame, project_style, first_frame_source } =
    input;

  const refs: StoredAsset[] = [];

  if (first_frame_source === 'auto_continuity' && prev_last_frame) {
    refs.push(prev_last_frame);
  }

  for (const char of characters_in_scene) {
    if (refs.length >= REF_LIMIT) break;
    if (char.dossier?.storage) refs.push(char.dossier.storage);
  }

  const charNames = characters_in_scene.map((c) => c.name).join(', ');
  const multiCharRule =
    characters_in_scene.length > 1
      ? `Characters in scene: ${charNames}. They are interacting in the same shot, consistent designs.`
      : characters_in_scene.length === 1
        ? `Character: ${charNames}.`
        : '';

  const promptParts = [
    `Style: ${project_style}.`,
    'Aspect ratio 9:16 vertical, full scene composition for short-form video (TikTok/Reels).',
    multiCharRule,
    scene.composition_hint ?? '',
    scene.description,
  ].filter(Boolean);

  return {
    prompt: promptParts.join('\n\n'),
    image_refs: refs,
  };
}

interface VideoPromptInput {
  scene: {
    scene_id: string;
    description: string;
    duration_sec: number;
    dialogue: Dialogue | null;
  };
  first_frame_storage: StoredAsset;
  model: string;
}

export function buildVideoPrompt(input: VideoPromptInput): {
  prompt: string;
  image_refs: StoredAsset[];
  duration_sec: number;
  aspect_ratio: '9:16';
} {
  const { scene, first_frame_storage, model } = input;
  const meta = getVideoModelMeta(model);
  const include_dialogue = meta?.has_native_audio === true && scene.dialogue !== null;

  const motionRule =
    scene.duration_sec <= 5
      ? 'short cinematic motion, single beat'
      : scene.duration_sec <= 10
        ? 'medium cinematic motion with character action'
        : 'extended scene with multiple beats';

  const promptParts = [
    scene.description,
    motionRule,
    include_dialogue && scene.dialogue
      ? `${scene.dialogue.speaker === 'narrator' ? 'Narrator' : 'Character'} says: "${scene.dialogue.text}"`
      : '',
  ].filter(Boolean);

  return {
    prompt: promptParts.join('\n\n'),
    image_refs: [first_frame_storage],
    duration_sec: scene.duration_sec,
    aspect_ratio: '9:16',
  };
}

interface VoicePromptInput {
  dialogue: Dialogue;
  narrator_voice: { tts_voice_id: string };
  character: CharacterForPrompt | null;
}

export function buildVoicePrompt(input: VoicePromptInput): {
  voice_id: string;
  text: string;
  fallback: boolean;
} {
  const { dialogue, narrator_voice, character } = input;

  if (dialogue.speaker === 'narrator') {
    return { voice_id: narrator_voice.tts_voice_id, text: dialogue.text, fallback: false };
  }

  const charVoice = character?.voice?.tts_voice_id;
  if (charVoice) {
    return { voice_id: charVoice, text: dialogue.text, fallback: false };
  }

  return { voice_id: narrator_voice.tts_voice_id, text: dialogue.text, fallback: true };
}
