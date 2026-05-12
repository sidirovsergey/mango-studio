/**
 * Phase-1.3.5 → Phase-1.4 migration helpers.
 *
 * VOICE ID REMAP NOTE (1.4.E.T9):
 * Four ElevenLabs voice IDs that were in Phase-1.3.5 production data are now MISSING in the
 * ElevenLabs catalog (404). They were replaced in the Phase-1.4 VOICE_POOL:
 *   Rachel (21m00Tcm4TlvDq8ikWAM)  → Janet  (eLDc7xhWxG2FElT3kUTj)
 *   Domi   (AZnzlk1XvdvUeBnXmlld)  → Jessica (cgSgspJ2msm6clMCkdW9)
 *   Antoni (ErXwobaYiN019PkySvjV)  → George  (JBFqnCBsd6RMkjVDRZzb)
 *   Arnold (VR6AewLTigWG4xSOukaG)  → Daniel  (onwK4e9ZLuTAKqWW03F9)
 * Adam (pNInz6obpgDQGcFmaJgB) and Bella/Sarah (EXAVITQu4vr4xnSDxMaL) are KEPT unchanged.
 *
 * INVERSE NOTE: downgradeScript_1_4 does NOT restore old voice IDs — the old IDs are dead in
 * ElevenLabs and restoring them would silently break TTS. The inverse strips only the Phase-1.4
 * schema fields.
 */

import type { Script } from './schemas';

// ---------------------------------------------------------------------------
// Voice ID remap table
// ---------------------------------------------------------------------------

export const VOICE_ID_REMAP: Record<string, string> = {
  '21m00Tcm4TlvDq8ikWAM': 'eLDc7xhWxG2FElT3kUTj', // Rachel → Janet (narrator default)
  AZnzlk1XvdvUeBnXmlld: 'cgSgspJ2msm6clMCkdW9', // Domi → Jessica (female young)
  ErXwobaYiN019PkySvjV: 'JBFqnCBsd6RMkjVDRZzb', // Antoni → George (male warm)
  VR6AewLTigWG4xSOukaG: 'onwK4e9ZLuTAKqWW03F9', // Arnold → Daniel (male serious)
};

function remapVoiceId(oldId: string | undefined): { id: string | undefined; remapped: boolean } {
  if (!oldId) return { id: undefined, remapped: false };
  const newId = VOICE_ID_REMAP[oldId];
  return newId !== undefined ? { id: newId, remapped: true } : { id: oldId, remapped: false };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface MigrationStats {
  scripts_upgraded: number;
  scenes_upgraded: number;
  characters_upgraded: number;
  voice_ids_remapped: number;
  voice_description_dropped: number;
}

// ---------------------------------------------------------------------------
// Upgrade: Phase-1.3.5 → Phase-1.4
// ---------------------------------------------------------------------------

/**
 * Upgrades a Phase-1.3.5 (or earlier) script JSON blob to a Phase-1.4 Script shape.
 *
 * Idempotent: if the script already has Phase-1.4 fields (description_ru on every scene), the
 * function detects this and returns the input unchanged (after schema coercion) with zero stats.
 *
 * @param legacy - Raw `script` JSONB from the `projects` table (unknown shape).
 * @param context - Caller-supplied metadata: project_tier used for `tier` + `tier_at_gen` fields.
 * @returns { upgraded, stats }
 */
export function upgradeScript_1_4(
  legacy: unknown,
  context: { project_tier?: string } = {},
): { upgraded: Script; stats: Partial<MigrationStats> } {
  if (!legacy || typeof legacy !== 'object') {
    throw new Error('upgradeScript_1_4: input is not an object');
  }

  const raw = legacy as Record<string, unknown>;
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const characters = Array.isArray(raw.characters) ? raw.characters : [];

  const resolvedTier =
    typeof raw.tier === 'string' && (raw.tier === 'economy' || raw.tier === 'premium')
      ? raw.tier
      : typeof context.project_tier === 'string' &&
          (context.project_tier === 'economy' || context.project_tier === 'premium')
        ? context.project_tier
        : 'economy';

  // Idempotency check: if every scene already has description_ru, treat as already-1.4
  const alreadyUpgraded =
    scenes.length > 0 &&
    scenes.every(
      (s: unknown) =>
        s &&
        typeof s === 'object' &&
        'description_ru' in (s as Record<string, unknown>) &&
        // Also check for the Phase-1.4 presence of description_en key (may be null)
        'description_en' in (s as Record<string, unknown>),
    );

  if (alreadyUpgraded) {
    // Still re-coerce to enforce schema consistency, but return zero stats
    return {
      upgraded: coerceToScript(raw, resolvedTier),
      stats: {
        scripts_upgraded: 0,
        scenes_upgraded: 0,
        characters_upgraded: 0,
        voice_ids_remapped: 0,
        voice_description_dropped: 0,
      },
    };
  }

  const stats: MigrationStats = {
    scripts_upgraded: 1,
    scenes_upgraded: 0,
    characters_upgraded: 0,
    voice_ids_remapped: 0,
    voice_description_dropped: 0,
  };

  // Migrate narrator_voice
  const legacyNarrator = raw.narrator_voice as Record<string, unknown> | undefined;
  let narrator_voice: Script['narrator_voice'];
  if (legacyNarrator) {
    const remapped = remapVoiceId(legacyNarrator.tts_voice_id as string | undefined);
    if (remapped.remapped) stats.voice_ids_remapped++;
    narrator_voice = {
      ...legacyNarrator,
      tts_voice_id: remapped.id as string,
      persona: undefined, // strip legacy persona if present
    } as Script['narrator_voice'];
  }

  // Migrate scenes
  const upgradedScenes = scenes.map((scene: unknown): Script['scenes'][number] => {
    if (!scene || typeof scene !== 'object') {
      throw new Error('upgradeScript_1_4: invalid scene entry');
    }
    const s = scene as Record<string, unknown>;
    stats.scenes_upgraded++;
    const description = typeof s.description === 'string' ? s.description : '';
    return {
      ...s,
      // description_ru: verbatim copy of description (Russian source of truth)
      description_ru: typeof s.description_ru === 'string' ? s.description_ru : description,
      // description_en: null (Grok fills on next regen)
      description_en: null,
      // New Phase-1.4 cinematography fields — null (Grok fills on next regen)
      composition: null,
      camera_movement: null,
      lighting: null,
      audio_direction: null,
      arc_role: null,
      // tier_at_gen inherited from project tier
      tier_at_gen: resolvedTier as 'economy' | 'premium',
    } as Script['scenes'][number];
  });

  // Migrate characters
  const upgradedCharacters = characters.map((char: unknown): Script['characters'][number] => {
    if (!char || typeof char !== 'object') {
      throw new Error('upgradeScript_1_4: invalid character entry');
    }
    const c = char as Record<string, unknown>;
    stats.characters_upgraded++;

    // Handle character voice remap + description drop
    let voice = c.voice as Record<string, unknown> | undefined;
    if (voice && typeof voice === 'object') {
      const { description: _desc, ...voiceRest } = voice as Record<string, unknown>;
      if ('description' in voice) {
        stats.voice_description_dropped++;
      }
      const remapped = remapVoiceId(voiceRest.tts_voice_id as string | undefined);
      if (remapped.remapped) stats.voice_ids_remapped++;
      voice = { ...voiceRest, tts_voice_id: remapped.id };
    }

    return { ...c, voice } as unknown as Script['characters'][number];
  });

  const upgraded: Script = {
    title: typeof raw.title === 'string' ? raw.title : '',
    // Phase-1.4 script-level fields
    visual_theme: null,
    tier: resolvedTier as 'economy' | 'premium',
    narrator_voice,
    characters: upgradedCharacters,
    scenes: upgradedScenes,
    master_clip_versions: Array.isArray(raw.master_clip_versions) ? raw.master_clip_versions : [],
    master_clip_active_version_id:
      typeof raw.master_clip_active_version_id === 'string'
        ? raw.master_clip_active_version_id
        : null,
  };

  return { upgraded, stats };
}

/** Coerce an already-1.4 object to Script type (used in idempotency path). */
function coerceToScript(raw: Record<string, unknown>, resolvedTier: string): Script {
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    visual_theme: (raw.visual_theme as Script['visual_theme']) ?? null,
    tier: (raw.tier as Script['tier']) ?? (resolvedTier as 'economy' | 'premium'),
    narrator_voice: raw.narrator_voice as Script['narrator_voice'],
    characters: Array.isArray(raw.characters) ? (raw.characters as Script['characters']) : [],
    scenes: Array.isArray(raw.scenes) ? (raw.scenes as Script['scenes']) : [],
    master_clip_versions: Array.isArray(raw.master_clip_versions)
      ? (raw.master_clip_versions as Script['master_clip_versions'])
      : [],
    master_clip_active_version_id:
      typeof raw.master_clip_active_version_id === 'string'
        ? raw.master_clip_active_version_id
        : null,
  };
}

// ---------------------------------------------------------------------------
// Downgrade: Phase-1.4 → Phase-1.3.5 (emergency rollback)
// ---------------------------------------------------------------------------

/**
 * Strips Phase-1.4-only fields from a Script, returning a Phase-1.3.5-compatible shape.
 *
 * LOSSY FIELDS (not recoverable):
 * - description_ru: dropped from each scene (was description in 1.3.5)
 * - description_en: dropped
 * - composition, camera_movement, lighting, audio_direction, arc_role: dropped
 * - tier_at_gen: dropped from scenes
 * - visual_theme: dropped from script root
 * - tier: dropped from script root
 * - voice.description: NOT restored (was deliberately removed in 1.4; old IDs are dead)
 * - narrator_voice.persona: dropped
 *
 * Voice IDs are NOT reverted — old IDs are MISSING in ElevenLabs catalog; reverting would
 * break TTS. The downgraded script retains Phase-1.4 voice IDs.
 */
export function downgradeScript_1_4(current: Script): unknown {
  const downScenes = current.scenes.map((scene) => {
    const {
      description_ru: _dr,
      description_en: _de,
      composition: _comp,
      camera_movement: _cm,
      lighting: _li,
      audio_direction: _ad,
      arc_role: _ar,
      tier_at_gen: _tag,
      ...rest
    } = scene as Record<string, unknown>;
    return rest;
  });

  const downCharacters = current.characters.map((char) => {
    // characters in Phase-1.3.5 are ScriptCharacterAction (keep/add/remove) — pass through as-is
    return char;
  });

  const {
    visual_theme: _vt,
    tier: _tier,
    narrator_voice,
    ...scriptRest
  } = current as Record<string, unknown>;

  // Strip narrator persona if present
  let strippedNarrator = narrator_voice as Record<string, unknown> | undefined;
  if (strippedNarrator && typeof strippedNarrator === 'object') {
    const { persona: _persona, ...narratorRest } = strippedNarrator;
    strippedNarrator = narratorRest;
  }

  return {
    ...scriptRest,
    narrator_voice: strippedNarrator,
    characters: downCharacters,
    scenes: downScenes,
  };
}
