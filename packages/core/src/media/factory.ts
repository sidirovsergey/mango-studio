import 'server-only';
import { MockMediaProvider } from './mock-provider';
import type { MediaProvider } from './provider';

export { MockMediaProvider } from './mock-provider';
export { FalMediaProvider, type FalMediaProviderOptions } from './FalMediaProvider';

export function getMediaProvider(): MediaProvider {
  // Phase 0/1.1: только Mock
  // Phase 1.2+: switch по env MEDIA_PROVIDER === 'fal'
  return new MockMediaProvider();
}
