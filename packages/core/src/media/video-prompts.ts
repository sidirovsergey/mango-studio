// buildVideoPrompt is now served by the per-engine dispatcher (F65, F73, F75).
export { buildVideoPrompt } from './video-prompts/index';

// buildFirstFramePrompt has moved to image-prompts/first-frame.ts (T4 refactor).
// Re-export for backward compatibility with existing callers.
export { buildFirstFramePrompt } from './image-prompts/first-frame';
export type { FirstFramePromptInput } from './image-prompts/first-frame';

import type { Dialogue } from './scene-types';
import type { StoredAsset } from './storage/StorageProvider';

interface CharacterForPrompt {
  id: string;
  name: string;
  description: string;
  full_prompt?: string;
  dossier?: { storage: StoredAsset; avatar?: StoredAsset } | null;
  voice?: { tts_voice_id?: string; description?: string };
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
