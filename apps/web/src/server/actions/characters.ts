'use server';

import {
  type CharacterDescriptor,
  type CharacterSheetOutput,
  type ProjectBible,
  type Tier,
  getMediaProvider,
} from '@mango/core';

export async function generateCharacterSheetAction(
  character: CharacterDescriptor,
  bible: ProjectBible,
  tier: Tier,
): Promise<CharacterSheetOutput> {
  return getMediaProvider().generateCharacterSheet({ character, bible, tier });
}
