'use server';

import { getLLMProvider } from '@mango/core';

export async function refineSceneAction(input: {
  scene_id: string;
  current: string;
  instruction: string;
}): Promise<{ updated_description: string }> {
  return getLLMProvider().refineScene(input);
}
