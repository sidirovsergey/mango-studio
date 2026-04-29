'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import {
  type CharacterDescriptor,
  type CharacterSheetOutput,
  type ProjectBible,
  type Tier,
  getMediaProvider,
} from '@mango/core';

export async function generateCharacterAction(
  character: CharacterDescriptor,
  bible: ProjectBible,
  tier: Tier,
): Promise<CharacterSheetOutput> {
  await getCurrentUserId();
  return getMediaProvider().generateCharacterSheet({ character, bible, tier });
}

export async function refineCharacterAction(
  character: CharacterDescriptor,
  bible: ProjectBible,
  tier: Tier,
): Promise<CharacterSheetOutput> {
  await getCurrentUserId();
  return getMediaProvider().generateCharacterSheet({ character, bible, tier });
}

export async function addCharacterAction(
  character: CharacterDescriptor,
  bible: ProjectBible,
  tier: Tier,
): Promise<CharacterSheetOutput> {
  await getCurrentUserId();
  return getMediaProvider().generateCharacterSheet({ character, bible, tier });
}
