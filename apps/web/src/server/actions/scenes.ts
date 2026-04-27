'use server';

import {
  type ProjectBible,
  type SceneGenOutput,
  type SceneIntent,
  type Tier,
  getMediaProvider,
} from '@mango/core';

export async function generateSceneAction(
  intent: SceneIntent,
  bible: ProjectBible,
  tier: Tier,
): Promise<SceneGenOutput> {
  return getMediaProvider().generateScene({ intent, bible, tier });
}
