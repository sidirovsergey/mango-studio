/**
 * director-state-summary.ts — Phase 1.4.F.T2
 *
 * Produces a compact, deterministic XML-style project state snapshot for the
 * Director Agent system prompt (<project_state> block). No Supabase deps — pure
 * computation from the script + characters arrays.
 *
 * F19 audit: Director needs to know active/archived characters and per-scene
 * media status to make correct tool-routing decisions.
 */

import type { Scene } from './schemas';
import type { Character } from './types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DirectorStateSummaryInput {
  script: {
    title?: string;
    tier?: 'economy' | 'premium';
    target_duration_sec?: number;
    scenes: Array<Scene>;
    characters: Array<Character>;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAR_DESC_MAX = 60;
const SCENE_DESC_MAX = 50;
const ARC_ROLE_WIDTH = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function padRight(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function resolveVoiceLabel(char: Character): string {
  // ElevenLabs voice pool retired 2026-05-13 along with the TTS pipeline.
  // Active video models generate native audio; voice picker is gone. We
  // surface a stable label so any historic Director-prompt fixtures keep
  // their shape during the rolling deploy.
  return char.voice?.tts_voice_id ? 'native' : 'unset';
}

function isFinalClipStale(scene: Scene): boolean {
  if (!scene.final_clip) return false;
  // final_clip is a derived asset whose composed_from references the
  // active video/voice versions at compose time. If either has moved on
  // (rollback / regen) the mux is stale and Director should suggest
  // compose_scene_final_clip.
  const cf = (
    scene as unknown as {
      final_clip?: {
        composed_from?: { video_version_id?: string; voice_audio_version_id?: string | null };
      };
    }
  ).final_clip?.composed_from;
  if (!cf) return false;
  if (scene.video_active_version_id && cf.video_version_id !== scene.video_active_version_id) {
    return true;
  }
  if (
    scene.voice_audio_active_version_id &&
    cf.voice_audio_version_id !== scene.voice_audio_active_version_id
  ) {
    return true;
  }
  return false;
}

function sceneMediaFlags(scene: Scene): string {
  const ff = scene.first_frame_versions && scene.first_frame_versions.length > 0 ? '✓' : '✗';
  const vid = scene.video_versions && scene.video_versions.length > 0 ? '✓' : '✗';
  const aud = scene.voice_audio_versions && scene.voice_audio_versions.length > 0 ? '✓' : '✗';
  const fc = scene.final_clip != null ? '✓' : '✗';
  // Phase 1.4.1: when fc=✓ but composed_from drifts from active versions,
  // suffix `(stale)` so Director can proactively suggest compose_scene_final_clip.
  const stale = isFinalClipStale(scene) ? ' (stale)' : '';
  return `ff${ff} vid${vid} aud${aud} fc${fc}${stale}`;
}

function formatCharacterActiveRow(char: Character): string {
  const dossierFlag = char.dossier != null ? 'true' : 'false';
  const voiceLabel = resolveVoiceLabel(char);
  const desc = truncate(char.description ?? '', CHAR_DESC_MAX);
  return `  ${char.id} | ${char.name} | dossier=${dossierFlag} | voice=${voiceLabel} | ${desc}`;
}

function formatCharacterArchivedRow(char: Character): string {
  return `  ${char.id} | ${char.name} | архивирован`;
}

function formatSceneRow(scene: Scene): string {
  const duration = `${scene.duration_sec}s`;
  const arcRaw = scene.arc_role ?? '???';
  const arc = padRight(arcRaw, ARC_ROLE_WIDTH);
  const flags = sceneMediaFlags(scene);
  const rawDesc = (scene.description_en ?? null) || scene.description;
  const desc = truncate(rawDesc, SCENE_DESC_MAX);
  return `  ${scene.scene_id} | ${duration} | ${arc} | ${flags} | "${desc}"`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function formatProjectStateSummary(input: DirectorStateSummaryInput): string {
  const { scenes, characters } = input.script;

  const activeChars = characters.filter((c) => !c.archived);
  const archivedChars = characters.filter((c) => c.archived === true);

  const parts: string[] = [];

  // characters_active — always emitted
  const activeRows = activeChars.map(formatCharacterActiveRow);
  if (activeRows.length > 0) {
    parts.push(`<characters_active>\n${activeRows.join('\n')}\n</characters_active>`);
  } else {
    parts.push('<characters_active>\n</characters_active>');
  }

  // characters_archived — only if at least one archived character
  if (archivedChars.length > 0) {
    const archivedRows = archivedChars.map(formatCharacterArchivedRow);
    parts.push(`<characters_archived>\n${archivedRows.join('\n')}\n</characters_archived>`);
  }

  // scenes_summary — always emitted
  const sceneRows = scenes.map(formatSceneRow);
  if (sceneRows.length > 0) {
    parts.push(`<scenes_summary>\n${sceneRows.join('\n')}\n</scenes_summary>`);
  } else {
    parts.push('<scenes_summary>\n</scenes_summary>');
  }

  return parts.join('\n\n');
}
