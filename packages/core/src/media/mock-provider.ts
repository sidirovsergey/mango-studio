import 'server-only';
import { demoCharacters } from '../fixtures/characters';
import { demoScenes } from '../fixtures/scenes';
import type {
  CharacterSheetInput,
  CharacterSheetOutput,
  MediaProvider,
  SceneGenInput,
  SceneGenOutput,
} from './provider';

const ECONOMY_LATENCY_MS = { character: 800, scene: 2000 };
const PREMIUM_LATENCY_MS = { character: 2500, scene: 8000 };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockMediaProvider implements MediaProvider {
  async generateCharacterSheet(input: CharacterSheetInput): Promise<CharacterSheetOutput> {
    const latency = input.tier === 'premium' ? PREMIUM_LATENCY_MS.character : ECONOMY_LATENCY_MS.character;
    await delay(latency);

    const fixture = demoCharacters[input.character.char_id] ?? demoCharacters.default!;
    const urls =
      fixture.reference_image_urls.length > 0
        ? fixture.reference_image_urls
        : [`/demo-fixtures/char-${fixture.char_id}-ref.png`];
    return {
      reference_image_urls: urls,
      cost_usd: 0,
      latency_ms: latency,
    };
  }

  async generateScene(input: SceneGenInput): Promise<SceneGenOutput> {
    const latency = input.tier === 'premium' ? PREMIUM_LATENCY_MS.scene : ECONOMY_LATENCY_MS.scene;
    await delay(latency);

    const fixture = demoScenes[input.intent.scene_id] ?? demoScenes.default!;
    return {
      video_url: fixture.video_url,
      poster_url: fixture.poster_url,
      end_frame_url: fixture.end_frame_url,
      duration_sec: input.intent.duration_sec,
      cost_usd: 0,
      latency_ms: latency,
    };
  }
}
