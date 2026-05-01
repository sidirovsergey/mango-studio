// Phase 1.2.6 — rule-based sync hint detection.
// Substring-match character name across scene descriptions.
// Pure logic, no Supabase deps.

import type { Character } from './types';
import type { SyncHint } from './chat-types';

export type SyncHintKind = 'refine' | 'archive' | 'unarchive';

export interface SyncHintScene {
  description: string;
}

export function detectSyncHint(
  character: Pick<Character, 'name' | 'description'>,
  scenes: SyncHintScene[],
  kind: SyncHintKind,
): SyncHint | undefined {
  const name = character.name.trim();
  if (!name) return undefined;
  const lowerName = name.toLowerCase();
  const matches = scenes
    .map((s, i) => ({
      idx: i + 1,
      hit: typeof s.description === 'string' && s.description.toLowerCase().includes(lowerName),
    }))
    .filter((m) => m.hit);
  if (matches.length === 0) return undefined;
  const sceneList = matches.map((m) => m.idx).join(', ');
  const wordForm = matches.length === 1 ? 'сцене' : 'сценах';
  return {
    reason: `${name} упоминается в ${wordForm} ${sceneList}`,
    suggested_instruction: kindToInstruction(kind, name, character.description ?? ''),
    status: 'visible',
  };
}

function kindToInstruction(kind: SyncHintKind, name: string, description: string): string {
  const desc = description.trim();
  switch (kind) {
    case 'refine':
      return desc
        ? `Обнови сцены так, чтобы они учли изменения в ${name}: ${desc}`
        : `Обнови сцены так, чтобы они учли изменения в ${name}`;
    case 'archive':
      return `Удали упоминания ${name} из сцен — этот персонаж больше не участвует в истории`;
    case 'unarchive':
      return `Верни ${name} в сцены, где этот персонаж органично может присутствовать`;
  }
}
