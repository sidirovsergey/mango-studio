/**
 * Snapshot regression tests for all Phase-1.4 build*Prompt functions.
 *
 * TDD discipline (inverted for snapshots):
 *   1. Tests call each builder with canonical fixtures.
 *   2. First pass: run with --update to accept snapshot strings as ground truth.
 *   3. Future runs: diff against these snapshots. Deliberate changes require --update + review.
 *
 * Snapshot strategy:
 *   - All snapshots use toMatchFileSnapshot() with unique filenames.
 *   - toMatchInlineSnapshot() is incompatible with loop-generated tests (same source line).
 *   - File snapshots are stored under __snapshots__/ beside this file.
 *
 * Builders covered:
 *   - buildScriptPrompt         (llm/prompts.ts)          — 4 cases
 *   - buildRefinePrompt         (llm/prompts.ts)          — 2 cases
 *   - buildDirectorSystemPrompt (llm/prompts.ts)          — 3 cases
 *   - buildAvatarPrompt         (media/prompts.ts)        — 5 chars × 3 styles = 15
 *   - buildDossierPrompt        (media/prompts.ts)        — 5 chars × 3 styles = 15
 *   - buildReferenceImagePrompt (image-prompts/…)         — 5 chars × 3 styles = 15
 *   - buildFirstFramePrompt     (image-prompts/…)         — 5 scenes × 2 sources = 10
 *   - buildVoicePrompt          (media/video-prompts.ts)  — 3 cases
 *   - buildVideoPrompt          (video-prompts/index.ts)  — 6 models × 5 scenes = 30
 *
 * Total: ~97 snapshots.
 */

import { describe, expect, it } from 'vitest';
import { buildFirstFramePrompt } from '../../media/image-prompts/first-frame';
import type { FirstFramePromptInput } from '../../media/image-prompts/first-frame';
import { buildReferenceImagePrompt } from '../../media/image-prompts/reference-image';
import { buildAvatarPrompt, buildDossierPrompt } from '../../media/prompts';
import type { Style } from '../../media/prompts';
import { buildVoicePrompt } from '../../media/video-prompts';
import { buildVideoPrompt } from '../../media/video-prompts/index';
import type { VideoPromptInput } from '../../media/video-prompts/index';
import { buildDirectorSystemPrompt, buildRefinePrompt, buildScriptPrompt } from '../prompts';
import type { DirectorContext } from '../prompts';
import { CANONICAL_SCENES, CANONICAL_SCRIPTS } from './snapshot-fixtures';

// ─── Shared test data ─────────────────────────────────────────────────────────

const STYLES: Style[] = ['3d_pixar', '2d_drawn', 'clay_art'];

// Post-2026-05-13: per-engine snapshots collapsed into a single unified builder.
// Every active model id (Grok, Seedance 2.0, Veo 3.1) emits the same prompt,
// so we keep just the seedance-2.0 label as the canonical snapshot bucket.
// Legacy engine labels (seedance-lite, kling-2.5, ltx, generic, veo-3.1) gone
// with their builders.
const VIDEO_MODELS = [
  { id: 'bytedance/seedance-2.0/image-to-video', label: 'seedance-2.0' },
] as const;

/** Synthetic first_frame_storage used as a stable stand-in for real uploads. */
const STUB_STORED_ASSET = {
  kind: 'fal_passthrough' as const,
  url: 'https://test.example/frame.jpg',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a CanonicalSceneFixture to the VideoPromptInput type. */
function toVideoPromptInput(
  fixture: (typeof CANONICAL_SCENES)[number],
  modelId: string,
): VideoPromptInput {
  const { scene, characters } = fixture;
  return {
    model: modelId,
    scene: {
      scene_id: scene.scene_id,
      description: scene.description,
      description_en: scene.description_en ?? undefined,
      duration_sec: scene.duration_sec,
      dialogue: scene.dialogue,
      composition: scene.composition ?? undefined,
      camera_movement: scene.camera_movement ?? undefined,
      lighting: scene.lighting ?? undefined,
      audio_direction: scene.audio_direction ?? undefined,
      arc_role: scene.arc_role ?? undefined,
    },
    characters_in_scene: characters.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      full_prompt: c.full_prompt,
    })),
    first_frame_storage: STUB_STORED_ASSET,
    audio_mode: scene.audio_mode,
    visual_theme: undefined,
    tier: 'premium',
  };
}

/** Map a CanonicalSceneFixture to the FirstFramePromptInput type. */
function toFirstFrameInput(
  fixture: (typeof CANONICAL_SCENES)[number],
  firstFrameSource: 'auto_continuity' | 'manual_text2img',
): FirstFramePromptInput {
  const { scene, characters } = fixture;
  return {
    scene: {
      scene_id: scene.scene_id,
      description: scene.description,
      description_en: scene.description_en ?? undefined,
      composition: scene.composition ?? undefined,
      camera_movement: scene.camera_movement ?? undefined,
      lighting: scene.lighting ?? undefined,
    },
    characters_in_scene: characters.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      full_prompt: c.full_prompt,
      dossier: null,
    })),
    prev_last_frame: firstFrameSource === 'auto_continuity' ? STUB_STORED_ASSET : null,
    project_style: '3d_pixar',
    visual_theme: null,
    first_frame_source: firstFrameSource,
  };
}

// ─── buildScriptPrompt ────────────────────────────────────────────────────────

describe('Snapshot — buildScriptPrompt', () => {
  // 15s economy, no existingVisualTheme
  it('renders 15s script without existingVisualTheme', async () => {
    const fixture = CANONICAL_SCRIPTS.find((f) => f.label === '15s')!;
    const out = buildScriptPrompt(
      {
        user_prompt: fixture.script.title ?? 'test',
        duration_sec: 15,
        format: '9:16',
        style: '3d_pixar',
      },
      { tier: fixture.script.tier ?? undefined },
    );
    await expect(out).toMatchFileSnapshot('./__snapshots__/script-15s-no-theme.txt');
  });

  // 15s economy, WITH existingVisualTheme (T6 path — theme preservation)
  it('renders 15s script WITH existingVisualTheme (T6 path)', async () => {
    const fixture = CANONICAL_SCRIPTS.find((f) => f.label === '15s')!;
    const out = buildScriptPrompt(
      {
        user_prompt: fixture.script.title ?? 'test',
        duration_sec: 15,
        format: '9:16',
        style: '3d_pixar',
      },
      {
        tier: fixture.script.tier ?? undefined,
        existingVisualTheme: fixture.script.visual_theme,
      },
    );
    await expect(out).toMatchFileSnapshot('./__snapshots__/script-15s-with-theme.txt');
  });

  // 60s premium, no existingVisualTheme
  it('renders 60s script without existingVisualTheme', async () => {
    const fixture = CANONICAL_SCRIPTS.find((f) => f.label === '60s')!;
    const out = buildScriptPrompt(
      {
        user_prompt: fixture.script.title ?? 'test',
        duration_sec: 60,
        format: '9:16',
        style: '3d_pixar',
      },
      { tier: fixture.script.tier ?? undefined },
    );
    await expect(out).toMatchFileSnapshot('./__snapshots__/script-60s-no-theme.txt');
  });

  // 60s premium, WITH existingVisualTheme
  it('renders 60s script WITH existingVisualTheme (T6 path)', async () => {
    const fixture = CANONICAL_SCRIPTS.find((f) => f.label === '60s')!;
    const out = buildScriptPrompt(
      {
        user_prompt: fixture.script.title ?? 'test',
        duration_sec: 60,
        format: '9:16',
        style: '3d_pixar',
      },
      {
        tier: fixture.script.tier ?? undefined,
        existingVisualTheme: fixture.script.visual_theme,
      },
    );
    await expect(out).toMatchFileSnapshot('./__snapshots__/script-60s-with-theme.txt');
  });
});

// ─── buildRefinePrompt ────────────────────────────────────────────────────────

describe('Snapshot — buildRefinePrompt', () => {
  it('renders refine for quiet scene', async () => {
    const quietFixture = CANONICAL_SCENES.find((f) => f.label === 'quiet')!;
    const script15 = CANONICAL_SCRIPTS.find((f) => f.label === '15s')!;
    const out = buildRefinePrompt({
      scene: quietFixture.scene,
      visual_theme: script15.script.visual_theme,
      prev_scene_summary: '(начало)',
      next_scene_summary: 'Апельсин бредёт к пустой миске',
      instruction: 'Сделай камеру чуть живее — лёгкое дыхание, не статика',
    });
    await expect(out).toMatchFileSnapshot('./__snapshots__/refine-quiet.txt');
  });

  it('renders refine for action scene', async () => {
    const actionFixture = CANONICAL_SCENES.find((f) => f.label === 'action')!;
    const out = buildRefinePrompt({
      scene: actionFixture.scene,
      visual_theme: null,
      prev_scene_summary: 'Гром во дворе',
      next_scene_summary: '(финал)',
      instruction: 'Увеличь напряжение перед прыжком — добавь slow-motion hint',
    });
    await expect(out).toMatchFileSnapshot('./__snapshots__/refine-action.txt');
  });
});

// ─── buildDirectorSystemPrompt ────────────────────────────────────────────────

describe('Snapshot — buildDirectorSystemPrompt', () => {
  it('renders director prompt with 15s script', async () => {
    const fixture = CANONICAL_SCRIPTS.find((f) => f.label === '15s')!;
    const ctx: DirectorContext = {
      idea: 'Утро рыжего кота Апельсина',
      duration_sec: 15,
      format: '9:16',
      style: '3d_pixar',
      script: {
        title: fixture.script.title,
        tier: fixture.script.tier ?? undefined,
        target_duration_sec: 15,
        scenes: fixture.script.scenes,
        characters: [],
      },
    };
    const out = buildDirectorSystemPrompt(ctx);
    await expect(out).toMatchFileSnapshot('./__snapshots__/director-15s.txt');
  });

  it('renders director prompt with 60s script', async () => {
    const fixture = CANONICAL_SCRIPTS.find((f) => f.label === '60s')!;
    const ctx: DirectorContext = {
      idea: 'Нуар-детектив Артём ищет последнего свидетеля',
      duration_sec: 60,
      format: '9:16',
      style: '3d_pixar',
      script: {
        title: fixture.script.title,
        tier: fixture.script.tier ?? undefined,
        target_duration_sec: 60,
        scenes: fixture.script.scenes,
        characters: [],
      },
    };
    const out = buildDirectorSystemPrompt(ctx);
    await expect(out).toMatchFileSnapshot('./__snapshots__/director-60s.txt');
  });

  it('renders director prompt with null script (no script yet)', async () => {
    const ctx: DirectorContext = {
      idea: 'Кот и рыба',
      duration_sec: 15,
      format: '9:16',
      style: '3d_pixar',
      script: null,
    };
    const out = buildDirectorSystemPrompt(ctx);
    await expect(out).toMatchFileSnapshot('./__snapshots__/director-null-script.txt');
  });
});

// ─── buildAvatarPrompt ────────────────────────────────────────────────────────
// Deduplicate characters: characters appear in multiple fixture scenes.
// Build a unique set by character id to avoid duplicate snapshot files.

const UNIQUE_CHARS = (() => {
  const seen = new Map<string, (typeof CANONICAL_SCENES)[number]['characters'][number]>();
  for (const fixture of CANONICAL_SCENES) {
    for (const char of fixture.characters) {
      if (!seen.has(char.id)) seen.set(char.id, char);
    }
  }
  return Array.from(seen.values());
})();

describe('Snapshot — buildAvatarPrompt', () => {
  for (const char of UNIQUE_CHARS) {
    for (const style of STYLES) {
      it(`${char.name} × ${style}`, async () => {
        const out = buildAvatarPrompt(
          {
            name: char.name,
            description: char.description,
            full_prompt: char.full_prompt,
            appearance: char.appearance,
            personality: char.personality,
          },
          style,
        );
        await expect(out).toMatchFileSnapshot(
          `./__snapshots__/avatar-${char.name.replace(/\s+/g, '_')}-${style}.txt`,
        );
      });
    }
  }
});

// ─── buildDossierPrompt ───────────────────────────────────────────────────────

describe('Snapshot — buildDossierPrompt', () => {
  for (const char of UNIQUE_CHARS) {
    for (const style of STYLES) {
      it(`${char.name} × ${style}`, async () => {
        const out = buildDossierPrompt(
          {
            name: char.name,
            description: char.description,
            full_prompt: char.full_prompt,
            appearance: char.appearance,
            personality: char.personality,
          },
          style,
        );
        await expect(out).toMatchFileSnapshot(
          `./__snapshots__/dossier-${char.name.replace(/\s+/g, '_')}-${style}.txt`,
        );
      });
    }
  }
});

// ─── buildReferenceImagePrompt ────────────────────────────────────────────────

describe('Snapshot — buildReferenceImagePrompt', () => {
  for (const char of UNIQUE_CHARS) {
    for (const style of STYLES) {
      it(`${char.name} × ${style}`, async () => {
        const out = buildReferenceImagePrompt(
          {
            name: char.name,
            description: char.description,
            full_prompt: char.full_prompt,
            appearance: char.appearance,
            personality: char.personality,
          },
          style,
        );
        await expect(out).toMatchFileSnapshot(
          `./__snapshots__/refimage-${char.name.replace(/\s+/g, '_')}-${style}.txt`,
        );
      });
    }
  }
});

// ─── buildFirstFramePrompt ────────────────────────────────────────────────────

describe('Snapshot — buildFirstFramePrompt', () => {
  for (const fixture of CANONICAL_SCENES) {
    for (const source of ['auto_continuity', 'manual_text2img'] as const) {
      it(`${fixture.label} × ${source}`, async () => {
        const input = toFirstFrameInput(fixture, source);
        const { prompt } = buildFirstFramePrompt(input);
        await expect(prompt).toMatchFileSnapshot(
          `./__snapshots__/firstframe-${fixture.label}-${source}.txt`,
        );
      });
    }
  }
});

// ─── buildVoicePrompt ─────────────────────────────────────────────────────────

describe('Snapshot — buildVoicePrompt', () => {
  const STUB_NARRATOR_VOICE = { tts_voice_id: 'EXAVITQu4vr4xnSDxMaL' };

  it('dialogue_close_up — character voice (English, non-narrator)', async () => {
    const fixture = CANONICAL_SCENES.find((f) => f.label === 'dialogue_close_up')!;
    const char = fixture.characters[0]!;
    const out = buildVoicePrompt({
      dialogue: fixture.scene.dialogue!,
      narrator_voice: STUB_NARRATOR_VOICE,
      character: {
        id: char.id,
        name: char.name,
        description: char.description,
        full_prompt: char.full_prompt,
        dossier: null,
        voice: char.voice
          ? { tts_voice_id: char.voice.tts_voice_id, description: undefined }
          : undefined,
      },
    });
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot(
      './__snapshots__/voice-char-english.txt',
    );
  });

  it('multi_character — fox dialogue (Cyrillic, character voice)', async () => {
    const fixture = CANONICAL_SCENES.find((f) => f.label === 'multi_character')!;
    const foxChar = fixture.characters.find((c) => c.name === 'Руслан')!;
    const out = buildVoicePrompt({
      dialogue: fixture.scene.dialogue!,
      narrator_voice: STUB_NARRATOR_VOICE,
      character: {
        id: foxChar.id,
        name: foxChar.name,
        description: foxChar.description,
        full_prompt: foxChar.full_prompt,
        dossier: null,
        voice: foxChar.voice
          ? { tts_voice_id: foxChar.voice.tts_voice_id, description: undefined }
          : undefined,
      },
    });
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot(
      './__snapshots__/voice-char-cyrillic.txt',
    );
  });

  it('narrator fallback — no character voice assigned', async () => {
    const fixture = CANONICAL_SCENES.find((f) => f.label === 'dialogue_close_up')!;
    const out = buildVoicePrompt({
      dialogue: fixture.scene.dialogue!,
      narrator_voice: STUB_NARRATOR_VOICE,
      character: {
        id: 'no-voice-char',
        name: 'NoVoice',
        description: 'A character with no voice assigned',
        dossier: null,
        // no voice field → fallback to narrator
      },
    });
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot(
      './__snapshots__/voice-narrator-fallback.txt',
    );
  });
});

// ─── buildVideoPrompt (dispatcher) ────────────────────────────────────────────

describe('Snapshot — buildVideoPrompt', () => {
  for (const { id, label } of VIDEO_MODELS) {
    for (const fixture of CANONICAL_SCENES) {
      it(`${label} × ${fixture.label}`, async () => {
        const input = toVideoPromptInput(fixture, id);
        const { prompt } = buildVideoPrompt(input);
        await expect(prompt).toMatchFileSnapshot(
          `./__snapshots__/video-${label}-${fixture.label}.txt`,
        );
      });
    }
  }
});
