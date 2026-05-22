import type { Scene } from './provider';
import type { Character } from './types';

/**
 * Swap LLM-emitted character name strings in `scene.character_ids[]` with
 * the corresponding `character.id` UUIDs. Pure transform — no DB, no logging.
 *
 * # Why this exists
 *
 * The script-generation prompt instructs the LLM to use character NAMES in
 * `scene.character_ids[]` because the LLM cannot know the UUIDs the server
 * will assign in `applyCharacterActions`. The prompt explicitly notes the
 * server will swap names → ids. Without this helper that swap was never
 * happening, so every downstream consumer (`generateFirstFrameAction`'s
 * `scene.character_ids.includes(c.id)` filter, F53 precondition,
 * `buildFirstFramePrompt`'s `characters_in_scene` selection, etc.) got an
 * empty character set per scene and silently skipped character anchoring.
 *
 * # Behavior
 *
 * For each scene:
 * - An entry that already looks like a UUID **AND** matches an actual
 *   character is kept as-is.
 * - An entry that already looks like a UUID but does NOT match any
 *   character is dropped with a warning (orphan UUID — Codex audit nit).
 * - An entry that looks like a name (case-insensitive match against
 *   `character.name`) is replaced with that character's `id`.
 * - An entry that matches neither (orphan name — character archived /
 *   typo / hallucination) is dropped with a warning.
 *
 * # Idempotency
 *
 * Subsequent passes are no-ops: once entries are UUIDs and the characters
 * exist, the helper keeps them unchanged.
 *
 * # Pure
 *
 * Returns a new `scenes` array. Does NOT mutate inputs. Does NOT log —
 * caller (typically `scripts.ts`) collects warnings and logs with
 * `project_id` context (per Codex audit round-1 NIT).
 */
export interface LinkSceneCharacterIdsWarning {
  scene_id: string;
  entry: string;
  reason: 'orphan_name' | 'orphan_uuid';
}

export interface LinkSceneCharacterIdsResult {
  scenes: Scene[];
  warnings: LinkSceneCharacterIdsWarning[];
}

/**
 * Standard UUID v4 / v1 shape detector. Tolerant of upper/lower case;
 * rejects garbage. The character.id values come from `crypto.randomUUID()`
 * in `applyCharacterActions`, which emits lowercase v4.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function linkSceneCharacterIds(
  scenes: Scene[],
  characters: Character[],
): LinkSceneCharacterIdsResult {
  const warnings: LinkSceneCharacterIdsWarning[] = [];

  // Pre-build lookup tables once for the whole pass. UUID keys lowercased
  // so the case-insensitive contract holds even if a future LLM/refine
  // path emits upper-case hex.
  const byId = new Map<string, Character>();
  const byNameCi = new Map<string, Character>();
  for (const c of characters) {
    byId.set(c.id.toLowerCase(), c);
    // First wins on duplicate-name collisions. Rare but possible after
    // refine; logging the dupe is left to the caller if it cares.
    const key = c.name.trim().toLowerCase();
    if (!byNameCi.has(key)) byNameCi.set(key, c);
  }

  const linkedScenes: Scene[] = scenes.map((scene) => {
    const linkedIds: string[] = [];
    for (const entry of scene.character_ids ?? []) {
      if (typeof entry !== 'string' || entry.length === 0) continue;

      if (isUuid(entry)) {
        const lc = entry.toLowerCase();
        const matched = byId.get(lc);
        if (matched) {
          // Echo the canonical (lowercase) form so downstream readers see
          // exactly what `characters[i].id` carries — avoids surprise
          // mismatches if scenes round-tripped through an upper-case
          // serializer somewhere.
          linkedIds.push(matched.id);
        } else {
          warnings.push({ scene_id: scene.scene_id, entry, reason: 'orphan_uuid' });
        }
        continue;
      }

      // Treat as name. Case-insensitive lookup; trim guards against the
      // LLM emitting "Финн " or "  Финн".
      const matched = byNameCi.get(entry.trim().toLowerCase());
      if (matched) {
        linkedIds.push(matched.id);
      } else {
        warnings.push({ scene_id: scene.scene_id, entry, reason: 'orphan_name' });
      }
    }
    return { ...scene, character_ids: linkedIds };
  });

  return { scenes: linkedScenes, warnings };
}
