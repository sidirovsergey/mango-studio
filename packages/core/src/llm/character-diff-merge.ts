import type { Character, ScriptCharacterAction } from './types';

/**
 * Applies a list of LLM-generated character actions to an existing characters array.
 *
 * Semantics:
 * - keep(id): preserve the character as-is, including dossier + voice (voice ALWAYS preserved from prior — F37 canary)
 * - add({name, ...}): create a new character with a fresh UUID and dossier=null
 * - remove(id): soft-delete — sets archived:true, preserves dossier
 *
 * Active characters not mentioned by any action are auto-archived (LLM forgot them).
 * Already-archived characters are always preserved as-is.
 *
 * F37 voice canary: on `keep`, the prior character's `voice` block is unconditionally
 * preserved regardless of what the LLM returned. If the LLM provided a DIFFERENT
 * voice_id, a console.warn is emitted for diagnostics. This prevents a refine cycle
 * from silently blanking a voice that was locked by audio rendering.
 */
export function applyCharacterActions(
  existing: Character[],
  actions: ScriptCharacterAction[],
): Character[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const result: Character[] = [];
  const touchedIds = new Set<string>();

  for (const a of actions) {
    if (a.action === 'keep') {
      const found = byId.get(a.id);
      // Ignore keep on unknown ids or already-archived characters
      if (found && !found.archived) {
        // F37 canary: check if the action carries a voice that differs from prior.
        // We cast to access any extra fields Grok might send beyond the strict schema.
        const actionAny = a as Record<string, unknown>;
        const attemptedVoice = actionAny.voice as Record<string, unknown> | undefined | null;
        const priorVoiceId = found.voice?.tts_voice_id;
        const attemptedVoiceId =
          attemptedVoice && typeof attemptedVoice === 'object'
            ? (attemptedVoice.tts_voice_id as string | undefined)
            : undefined;

        if (attemptedVoiceId !== undefined && attemptedVoiceId !== priorVoiceId) {
          console.warn(
            `[character-diff-merge] F37 canary: LLM attempted to change voice on keep action. Character id="${found.id}", prior tts_voice_id="${priorVoiceId ?? '(none)'}", attempted tts_voice_id="${attemptedVoiceId}". Preserving prior voice.`,
          );
        }

        // FORCE: always use prior voice block, regardless of what Grok returned.
        result.push({ ...found, voice: found.voice });
        touchedIds.add(found.id);
      }
    } else if (a.action === 'add') {
      const newChar: Character = {
        id: crypto.randomUUID(),
        name: a.name,
        description: a.description,
        full_prompt: '',
        appearance: a.appearance ?? {},
        personality: a.personality,
        voice: {},
        dossier: null,
        reference_images: [],
      };
      result.push(newChar);
    } else if (a.action === 'remove') {
      const found = byId.get(a.id);
      if (found && !found.archived) {
        result.push({ ...found, archived: true });
        touchedIds.add(found.id);
      }
    }
  }

  // Handle existing characters not mentioned in actions:
  // - already-archived: preserve as-is
  // - active but not touched: auto-archive (LLM omitted them)
  for (const c of existing) {
    if (touchedIds.has(c.id)) continue;
    if (c.archived) {
      result.push(c);
    } else {
      // Active, not mentioned — auto-archive
      result.push({ ...c, archived: true });
    }
  }

  return result;
}
