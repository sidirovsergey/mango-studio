/**
 * Static rubric checker for video prompts — Phase 1.4 / F89
 *
 * Deterministic regex-based lint pass over a generated video prompt string.
 * No LLM calls. Intended to run in CI against T2 snapshot fixtures.
 *
 * ## Axes (0..7)
 * 1. shot_size       — Shot size label (Close Up, Medium, Wide, etc.)
 * 2. angle           — Camera angle label (Eye Level, Low Angle, etc.)
 * 3. camera_movement — Cinematic camera verb (Dolly, Tracking, Crane, etc.)
 * 4. lens            — Lens spec (35mm, 85mm, anamorphic, wide-angle, etc.)
 * 5. lighting        — Lighting vocabulary (Lighting:, key, fill, rim, golden hour, ambient, etc.)
 * 6. palette         — Colour vocabulary (hex, palette, warm, cool, saturated, etc.)
 * 7. audio           — Audio direction (Audio:, [AUDIO], Dialogue:, sfx, etc.)
 *
 * ## Builder coverage notes (as of Phase 1.4 snapshots)
 *
 * | Builder       | Expected score | Notes                                           |
 * |---------------|----------------|-------------------------------------------------|
 * | Seedance 2.0  | 7/7            | All axes present                                |
 * | Seedance Lite | 6/7            | No [AUDIO] block (Lite has no audio block)      |
 * | Kling 2.5     | 5–6/7          | No palette block; lighting via ambient / action |
 * | Veo 3.1       | 3–4/7          | BUILDER GAP: no shot/angle labels, no Audio:    |
 * | LTX           | 3/7            | Minimal format: camera+lens+audio only          |
 * | Generic       | 2/7            | Bare description + camera line, no audio/light  |
 *
 * ## has_aspect_reminder
 * As of Phase 1.4, the aspect ratio (9:16) is stored in VideoPromptOutput.aspect_ratio
 * but is NOT embedded in any builder's prompt text. All snapshots will have
 * has_aspect_reminder = false. This is a BUILDER GAP — the rubric faithfully
 * reflects it rather than masking it.
 *
 * ## has_english_mirror heuristic
 * Counts Latin-script codepoints vs Cyrillic codepoints in the whole prompt.
 * If Latin > Cyrillic (allowing for some Cyrillic in character names / action lines),
 * returns true. Works well for all builders since description_en is always English.
 * Returns false only for hypothetical Cyrillic-only prompts (no builder emits these).
 */

import { ANGLE_LABEL, CAMERA_VERB } from '../../media/video-prompts/_seedance-shared';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RubricAxes {
  shot_size: boolean;
  angle: boolean;
  camera_movement: boolean;
  lens: boolean;
  lighting: boolean;
  palette: boolean;
  audio: boolean;
}

export interface RubricResult {
  /** Any recognised cinematic camera verb is present. */
  has_camera_verb: boolean;
  /** An audio direction line is present ([AUDIO], Audio:, beat-marker, Dialogue:). */
  has_audio_line: boolean;
  /**
   * Heuristic: the prompt contains more Latin-script characters than Cyrillic.
   * All production builders include an English description_en line, so this is
   * true for every builder that targets an English-speaking model.
   */
  has_english_mirror: boolean;
  /** An explicit negative list is present ("Avoid:"). */
  has_negative_list: boolean;
  /**
   * An aspect-ratio reminder is embedded in the prompt text.
   * NOTE: As of Phase 1.4, NO builder embeds "9:16" or "vertical" in the
   * prompt — aspect_ratio is returned only in VideoPromptOutput metadata.
   * All current snapshots will return false here. Builder gap, not rubric gap.
   */
  has_aspect_reminder: boolean;
  /** Number of cinematography axes present (0–7). */
  axis_coverage_score: number;
  /** Breakdown of which axes are present. */
  axes_present: RubricAxes;
}

// ---------------------------------------------------------------------------
// Regex patterns derived from label tables + cinematography vocabulary
// ---------------------------------------------------------------------------

/**
 * Camera-verb regex built from CAMERA_VERB values + common fallbacks.
 * Escapes special regex chars in label values (none currently, but defensive).
 */
const CAMERA_VERB_PATTERN: RegExp = (() => {
  const verbsFromTable = Object.values(CAMERA_VERB).map((v) =>
    v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  // Supplement with individual root words for resilience (e.g. "Tracking shot")
  const extras = [
    'Dolly',
    'Crane',
    'Orbit',
    'Tracking',
    'Pan',
    'Tilt',
    'Whip',
    'POV',
    'Push',
    'Pull',
    'Static',
    'Handheld',
  ];
  const allTerms = Array.from(new Set([...verbsFromTable, ...extras]));
  return new RegExp(`\\b(${allTerms.join('|')})\\b`, 'i');
})();

/**
 * Shot-size regex — anchored to framing-context prefixes.
 *
 * WHY NOT match SHOT_SIZE_LABEL values directly:
 *   - "Medium" also appears as a camera-speed word (e.g. "Tracking, medium, 50mm" in Veo).
 *   - "Wide" also appears in lens descriptors (e.g. "24mm wide" in Veo/Kling).
 *   - Matching those terms raw produces false positives.
 *
 * Solution: require the framing-context marker "shot:" (Seedance [CAMERA] blocks)
 * or "Framing:" (Kling beat-marked timeline) as the anchor. Both builders emit
 * one of these prefixes if and only if shot_size + angle are known.
 *
 * Builders that do NOT emit framing labels (Veo, LTX, Generic) will correctly
 * return shot_size = false.
 */
const SHOT_SIZE_PATTERN = /\b(?:shot:|Framing:)\s/i;

/**
 * Camera angle regex built from ANGLE_LABEL values.
 * Also matches standalone angle keywords.
 */
const ANGLE_PATTERN: RegExp = (() => {
  const labels = Object.values(ANGLE_LABEL).map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const extras = ['Low Angle', 'High Angle', "Bird's Eye", 'Dutch Angle', 'dutch'];
  const allTerms = Array.from(new Set([...labels, ...extras]));
  return new RegExp(`\\b(${allTerms.join('|')})\\b`, 'i');
})();

/**
 * Lens character regex.
 * Matches focal-length specs (50mm, 85mm, 24mm wide, etc.) and lens type names.
 */
const LENS_PATTERN = /\b(\d{1,3}mm|anamorphic|wide-angle|telephoto|fisheye)\b/i;

/**
 * Lighting vocabulary regex.
 * Uses word boundaries to avoid false positives:
 *   - "naturalistic" (pacing) must NOT match "natural" (lighting)
 *   - "flares" in "lens flares" must NOT match as lighting
 *
 * "ambient" intentionally included — "ambient room tone" still signals
 * presence of environmental context that the lighting axis tracks.
 */
const LIGHTING_PATTERN =
  /\bLighting:\b|\blight\b|\bkey\b|\bfill\b|\brim\b|\bgolden hour\b|\bblue hour\b|\bnatural\b|\bambient\b/i;

/**
 * Colour / palette vocabulary regex.
 * Matches hex strings OR named colour temperature / saturation terms.
 * "warm" and "cool" appear in lighting recipes (e.g. "warm fill + cool rim").
 */
const PALETTE_PATTERN =
  /#[0-9a-fA-F]{3,6}|\bpalette\b|\bwarm\b|\bcool\b|\bsaturated\b|\bdesaturated\b/i;

/**
 * Audio direction regex.
 * Matches:
 *   - Seedance [AUDIO] block header
 *   - Kling / LTX / Veo "Audio:" prefix
 *   - Kling beat-marker timestamps [00:00] in audio context
 *   - Veo / LTX "Dialogue:" mention
 *   - Generic sfx / music / soundtrack vocabulary
 */
const AUDIO_PATTERN = /\[AUDIO\]|Audio:|Dialogue:|sfx\b|soundtrack|score\b|\[\d{2}:\d{2}\b/i;

/**
 * Aspect-ratio reminder regex.
 * NOTE: As of Phase 1.4, no builder embeds aspect ratio in the prompt text.
 * This regex is defined per spec; it will return false for all current snapshots.
 */
const ASPECT_PATTERN = /\b(9:16|1:1|16:9|vertical|square|landscape)\b/i;

// ---------------------------------------------------------------------------
// English-mirror heuristic
// ---------------------------------------------------------------------------

/**
 * Returns true when the prompt contains more Latin-script characters than
 * Cyrillic. This indicates the presence of an English description_en line,
 * which all production builders include.
 *
 * Heuristic rationale:
 *   - All builders emit description_en as an English sentence (100+ Latin chars).
 *   - Character descriptions in Cyrillic add 30–80 Cyrillic chars per character.
 *   - Even with 2 Cyrillic-heavy characters, Latin chars dominate.
 *   - A prompt that is Cyrillic-only (hypothetical fallback) will return false.
 */
function detectEnglishMirror(prompt: string): boolean {
  let latinCount = 0;
  let cyrillicCount = 0;
  for (const ch of prompt) {
    const cp = ch.codePointAt(0)!;
    // Latin Basic, Latin-1 Supplement, Latin Extended A/B, Latin Extended Additional
    if ((cp >= 0x0041 && cp <= 0x007a) || (cp >= 0x00c0 && cp <= 0x024f)) {
      latinCount++;
    }
    // Cyrillic block U+0400–U+04FF
    else if (cp >= 0x0400 && cp <= 0x04ff) {
      cyrillicCount++;
    }
  }
  return latinCount > cyrillicCount;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scores a video prompt string against a deterministic cinematography rubric.
 *
 * @param prompt - The raw prompt string emitted by a video prompt builder.
 * @returns RubricResult with 5 booleans + axis_coverage_score (0..7) + axes_present.
 *
 * Edge cases:
 *   - Empty string → all booleans false, score 0.
 *   - Very short Generic prompt → may score 1–2; that is expected.
 */
export function scoreVideoPrompt(prompt: string): RubricResult {
  if (!prompt || prompt.trim().length === 0) {
    return {
      has_camera_verb: false,
      has_audio_line: false,
      has_english_mirror: false,
      has_negative_list: false,
      has_aspect_reminder: false,
      axis_coverage_score: 0,
      axes_present: {
        shot_size: false,
        angle: false,
        camera_movement: false,
        lens: false,
        lighting: false,
        palette: false,
        audio: false,
      },
    };
  }

  // ── Booleans ────────────────────────────────────────────────────────────────

  const has_camera_verb = CAMERA_VERB_PATTERN.test(prompt);
  const has_audio_line = AUDIO_PATTERN.test(prompt);
  const has_english_mirror = detectEnglishMirror(prompt);
  const has_negative_list = /\bAvoid:/i.test(prompt);
  const has_aspect_reminder = ASPECT_PATTERN.test(prompt);

  // ── Axis coverage ────────────────────────────────────────────────────────────

  const axes_present: RubricAxes = {
    shot_size: SHOT_SIZE_PATTERN.test(prompt),
    angle: ANGLE_PATTERN.test(prompt),
    camera_movement: CAMERA_VERB_PATTERN.test(prompt),
    lens: LENS_PATTERN.test(prompt),
    lighting: LIGHTING_PATTERN.test(prompt),
    palette: PALETTE_PATTERN.test(prompt),
    audio: AUDIO_PATTERN.test(prompt),
  };

  const axis_coverage_score = Object.values(axes_present).filter(Boolean).length;

  return {
    has_camera_verb,
    has_audio_line,
    has_english_mirror,
    has_negative_list,
    has_aspect_reminder,
    axis_coverage_score,
    axes_present,
  };
}
