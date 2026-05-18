import { z } from 'zod';
import { type Dialogue, DialogueSchema } from '../media/scene-types';

/**
 * Phase 1.8.0a — Script schema adapter (reader-only).
 *
 * Every script consumer in the codebase reads through `normalizeScript()`.
 * The function accepts BOTH the existing v1.4 schema (`scene.description`,
 * `scene.dialogue: single|null`, no `narrative_paragraph`, no `shots`)
 * AND the future CJM schema (`scene.narrative_paragraph`,
 * `scene.dialogue: Dialogue[]`, `scene.shots: ShotSpec[]`). The generator
 * and writers remain unchanged in 1.8.0a — this is a pure refactor that
 * ships green and unlocks 1.8.0b (generator rewrite) as a clean follow-up.
 *
 * Two distinct canonical channels are synthesized for downstream consumers:
 *
 * - **`narrative_paragraph`** (Russian, UI rendering)
 *     ← `scene.narrative_paragraph ?? description_ru`
 *     The Stage 03 storyboard text. Russian-canonical because the audience
 *     is Russian-speaking; `description_ru` is the authoritative source on
 *     legacy projects.
 *
 * - **`image_prompt_text`** (English-preferred, downstream image/video models)
 *     ← `scene.description_en ?? description`
 *     The text fed to Veo/Seedance/ffmpeg-api prompt builders. English-pref
 *     because image/video models produce higher-quality output on English
 *     prompts. Preserves v1.4 `director-state-summary.ts:82` default chain
 *     exactly: `description_en ?? description`.
 *
 * Properties:
 * - **Pure** — no DB, LLM, or side-effect calls.
 * - **`.raw` reference preserved** — `result.raw === inputObject` (reference
 *   equality, not deep). Round-trip via `.raw` returns the EXACT original
 *   input shape; this is the writers' source of truth.
 * - **Tolerant** — null/missing description fields coerce to empty string;
 *   `dialogue` accepts single, array, or null.
 * - **Scene-level `.passthrough()`** preserves unknown scene fields.
 *
 * LLM tool surface freeze: tool `inputSchema` fields stay named `description`
 * (not `narrative_paragraph`). Internal code uses `narrative_paragraph` only.
 * Field rename happens in 1.8.0b, alongside the generator change.
 */

export interface ShotSpec {
  shot_id: string;
  description: string;
  image_prompt: string;
}

export interface NormalizedScene {
  // Identity + timing (passthrough)
  scene_id: string;
  duration_sec: number;
  arc_role?: string | null;
  location?: string | null;

  // === Canonical for consumers — always present ===
  /** Russian-canonical paragraph for UI rendering. */
  narrative_paragraph: string;
  /** English-preferred prompt text for downstream image/video models. */
  image_prompt_text: string;
  /** Always an array, possibly empty (for legacy `dialogue: null` scenes). */
  dialogue: Dialogue[];
  /** Always ≥1 shot; synthesized from image_prompt_text if absent. */
  shots: ShotSpec[];

  // === Legacy passthrough — for round-tripping back to generator/storage ===
  description: string;
  description_ru: string;
  description_en: string | null;
  legacy_dialogue: Dialogue | null;
}

export interface NormalizedScript {
  scenes: NormalizedScene[];
  characters: unknown[];
  /** Bit-for-bit original input reference. */
  raw: unknown;
}

const ShotSpecSchema = z.object({
  shot_id: z.string(),
  description: z.string(),
  image_prompt: z.string(),
});

/**
 * Lenient Zod schema — accepts existing v1.4 shape AND future CJM shape.
 *
 * Codex audit 2026-05-18 fixes applied:
 * - Scene-level `.passthrough()` so unknown scene fields survive.
 * - Nullable + optional on all description fields (NOT `.default('')`) so
 *   `description: null` doesn't throw.
 */
const LenientSceneSchema = z
  .object({
    scene_id: z.string(),
    duration_sec: z.number(),
    arc_role: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    description_ru: z.string().nullable().optional(),
    description_en: z.string().nullable().optional(),
    dialogue: z
      .union([DialogueSchema.nullable(), z.array(DialogueSchema)])
      .nullable()
      .optional(),
    narrative_paragraph: z.string().nullable().optional(),
    shots: z.array(ShotSpecSchema).optional(),
  })
  .passthrough();

const LenientScriptSchema = z
  .object({
    scenes: z.array(LenientSceneSchema),
    characters: z.array(z.unknown()).default([]),
  })
  .passthrough();

export function normalizeScript(raw: unknown): NormalizedScript {
  const parsed = LenientScriptSchema.parse(raw);

  const scenes: NormalizedScene[] = parsed.scenes.map((s) => {
    // Defensive coercion for nullable-or-missing fields.
    const description = s.description ?? '';
    const description_ru = s.description_ru ?? description;
    const description_en = s.description_en ?? null;

    // Channel 1 (RU, UI) — defaults via description_ru.
    const narrative_paragraph = s.narrative_paragraph ?? description_ru;

    // Channel 2 (EN-preferred, downstream models) — defaults via description_en
    // ?? description. Matches v1.4 `director-state-summary.ts:82` chain
    // exactly. DO NOT switch this to narrative_paragraph or you flip
    // model context from English to Russian (Codex blocker).
    const image_prompt_text = description_en ?? description;

    // Normalize dialogue to array.
    let dialogue: Dialogue[];
    let legacy_dialogue: Dialogue | null = null;
    if (Array.isArray(s.dialogue)) {
      dialogue = s.dialogue;
      legacy_dialogue = s.dialogue[0] ?? null;
    } else if (s.dialogue) {
      dialogue = [s.dialogue];
      legacy_dialogue = s.dialogue;
    } else {
      dialogue = [];
      legacy_dialogue = null;
    }

    // Synthesize one default shot from image_prompt_text if missing.
    const shots: ShotSpec[] = s.shots ?? [
      {
        shot_id: `${s.scene_id}_shot1`,
        description: image_prompt_text,
        image_prompt: image_prompt_text,
      },
    ];

    return {
      scene_id: s.scene_id,
      duration_sec: s.duration_sec,
      arc_role: s.arc_role ?? null,
      location: s.location ?? null,
      narrative_paragraph,
      image_prompt_text,
      dialogue,
      shots,
      description,
      description_ru,
      description_en,
      legacy_dialogue,
    };
  });

  return {
    scenes,
    characters: parsed.characters as unknown[],
    raw,
  };
}
