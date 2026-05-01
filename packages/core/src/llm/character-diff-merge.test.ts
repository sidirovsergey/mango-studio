import { describe, expect, it } from 'vitest';
import { applyCharacterActions } from './character-diff-merge';
import type { Character, ScriptCharacterAction } from './types';

const mkChar = (id: string, name: string, archived?: boolean): Character => ({
  id,
  name,
  description: '',
  full_prompt: '',
  appearance: {},
  voice: {},
  dossier: null,
  reference_images: [],
  ...(archived ? { archived: true } : {}),
});

describe('applyCharacterActions', () => {
  it('keep — preserve существующих с dossierами', () => {
    const existing = [mkChar('a', 'Alice'), mkChar('b', 'Bob')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'keep', id: 'b' },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]!); // identity preserved
  });

  it('add — append нового с свежим uuid + dossier=null', () => {
    const existing = [mkChar('a', 'Alice')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'add', name: 'Cat', description: 'a cat', appearance: { species: 'cat' } },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    expect(result[1]!.name).toBe('Cat');
    expect(result[1]!.dossier).toBeNull();
    expect(result[1]!.id).not.toBe('a');
  });

  it('remove — soft-delete (archived: true), preserve dossier', () => {
    const existing = [
      mkChar('a', 'Alice'),
      {
        ...mkChar('b', 'Bob'),
        dossier: {
          storage: { kind: 'fal_passthrough' as const, url: 'x' },
          model: 'm',
          format: '16:9' as const,
          quality: '1080p' as const,
          generated_at: 'now',
        },
      },
    ];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'remove', id: 'b' },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    const bob = result.find((c) => c.id === 'b')!;
    expect(bob.archived).toBe(true);
    expect(bob.dossier).not.toBeNull(); // preserved
  });

  it('mix: keep+add+remove одновременно', () => {
    const existing = [mkChar('a', 'Alice'), mkChar('b', 'Bob')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'remove', id: 'b' },
      { action: 'add', name: 'Cat', description: 'c', appearance: {} },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result.find((c) => c.id === 'a')?.archived).toBeUndefined();
    expect(result.find((c) => c.id === 'b')?.archived).toBe(true);
    expect(result.find((c) => c.name === 'Cat')).toBeDefined();
  });

  it('keep на несуществующем id — игнорирует', () => {
    const existing = [mkChar('a', 'Alice')];
    const actions: ScriptCharacterAction[] = [
      { action: 'keep', id: 'a' },
      { action: 'keep', id: 'nonexistent' },
    ];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(1);
  });

  it('archived characters от прошлых refine не пересоздаются', () => {
    const existing = [mkChar('a', 'Alice'), mkChar('b', 'Bob', true)];
    const actions: ScriptCharacterAction[] = [{ action: 'keep', id: 'a' }];
    const result = applyCharacterActions(existing, actions);
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.id === 'b')?.archived).toBe(true); // archived оставлен
  });
});
