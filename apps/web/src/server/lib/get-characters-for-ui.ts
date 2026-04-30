import type { Character } from '@mango/core';

export interface CharactersForUI {
  active: Character[];
  archived: Character[];
}

export function getCharactersForUI(characters: Character[] | undefined): CharactersForUI {
  const all = characters ?? [];
  return {
    active: all.filter((c) => !c.archived),
    archived: all.filter((c) => c.archived),
  };
}
