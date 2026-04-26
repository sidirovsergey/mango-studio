import 'server-only';
import { MockMediaProvider } from './mock-provider';
import type { MediaProvider } from './provider';

export type { MediaProvider, CharacterSheetInput, CharacterSheetOutput, SceneGenInput, SceneGenOutput } from './provider';

export function getMediaProvider(): MediaProvider {
  // Phase 0: только Mock
  // Phase 1: switch по env MEDIA_PROVIDER === 'fal'
  return new MockMediaProvider();
}
