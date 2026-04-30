import type { Character, ScriptCharacterAction } from './types'

/**
 * Applies a list of LLM-generated character actions to an existing characters array.
 *
 * Semantics:
 * - keep(id): preserve the character as-is, including dossier
 * - add({name, ...}): create a new character with a fresh UUID and dossier=null
 * - remove(id): soft-delete — sets archived:true, preserves dossier
 *
 * Active characters not mentioned by any action are auto-archived (LLM forgot them).
 * Already-archived characters are always preserved as-is.
 */
export function applyCharacterActions(
  existing: Character[],
  actions: ScriptCharacterAction[],
): Character[] {
  const byId = new Map(existing.map(c => [c.id, c]))
  const result: Character[] = []
  const touchedIds = new Set<string>()

  for (const a of actions) {
    if (a.action === 'keep') {
      const found = byId.get(a.id)
      // Ignore keep on unknown ids or already-archived characters
      if (found && !found.archived) {
        result.push(found)
        touchedIds.add(found.id)
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
      }
      result.push(newChar)
    } else if (a.action === 'remove') {
      const found = byId.get(a.id)
      if (found && !found.archived) {
        result.push({ ...found, archived: true })
        touchedIds.add(found.id)
      }
    }
  }

  // Handle existing characters not mentioned in actions:
  // - already-archived: preserve as-is
  // - active but not touched: auto-archive (LLM omitted them)
  for (const c of existing) {
    if (touchedIds.has(c.id)) continue
    if (c.archived) {
      result.push(c)
    } else {
      // Active, not mentioned — auto-archive
      result.push({ ...c, archived: true })
    }
  }

  return result
}
