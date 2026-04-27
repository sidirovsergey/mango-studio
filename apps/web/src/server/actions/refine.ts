'use server';

import { getLLMProvider } from '@mango/core';

export async function refineSceneAction(input: {
  scene_id: string;
  current: string;
  instruction: string;
}): Promise<{ updated_description: string }> {
  const llm = getLLMProvider();
  const result = await llm.refineScene(input);
  return result.output;
}
