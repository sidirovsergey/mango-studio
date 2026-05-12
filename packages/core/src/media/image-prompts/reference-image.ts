import type { CharacterForPrompt, Style } from '../prompts';

/**
 * Build a prompt for a single-pose 1:1 character reference image.
 *
 * This is distinct from:
 *   - buildAvatarPrompt  — portrait/face close-up (1:1)
 *   - buildDossierPrompt — multi-pose 16:9 model sheet
 *
 * The reference image is a neutral full-body (or 3/4) standing pose on a
 * pure white background, used as the visual anchor when generating
 * first-frames for scenes (F53 fix path A).
 *
 * Prompt is English-leaning to match nano-banana's training bias (F50).
 * char.description and style are passed through verbatim (may be Russian).
 */
export function buildReferenceImagePrompt(char: CharacterForPrompt, style: Style): string {
  const appearanceDetails = char.full_prompt ? `Appearance details: ${char.full_prompt}` : null;

  const lines: string[] = [
    `Single-pose character design reference for ${char.name}.`,
    '',
    `Style: ${style}`,
    '',
    `Character: ${char.description}`,
    ...(appearanceDetails ? [appearanceDetails] : []),
    '',
    "OUTPUT FORMAT — single 1:1 square image. One character, full-body or 3/4 view, hands visible. Neutral A-pose or relaxed standing pose. Centered in frame with even spacing on all sides. Pure white background, no shadow on background. No environment, no props beyond the character's intrinsic costume.",
    '',
    'Avoid: text in image, panels, captions, multiple views, side-by-side poses, watermarks, signature, color swatches, design notes, multiple characters.',
  ];

  return lines.join('\n');
}
