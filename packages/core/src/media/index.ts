import 'server-only';
import { MockMediaProvider } from './mock-provider';
import type { MediaProvider } from './provider';

export type {
  MediaProvider,
  GenerateCharacterDossierInput,
  GenerateCharacterDossierResult,
  DossierFormat,
  DossierQuality,
  AssetContext,
} from './provider';

export type { StoredAsset, StorageProvider } from './storage/StorageProvider';

export function getMediaProvider(): MediaProvider {
  // Phase 0/1.1: только Mock
  // Phase 1.2+: switch по env MEDIA_PROVIDER === 'fal'
  return new MockMediaProvider();
}
