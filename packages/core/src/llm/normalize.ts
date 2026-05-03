import type { Scene } from './provider';

type LegacyScene = {
  scene_id: string;
  description: string;
  duration_sec: number;
  voiceover?: string;
} & Partial<Scene>;

/**
 * Конвертирует scene jsonb из legacy формата (Phase 1.1/1.2 — `voiceover: string`)
 * в новый schema (Phase 1.3 — `dialogue: {speaker, text} | null`, character_ids, asset fields).
 *
 * Идемпотентна: если scene уже в новом формате — возвращает её без изменений.
 */
export function normalizeScene(raw: unknown): Scene {
  const r = raw as LegacyScene & Record<string, unknown>;

  if ('dialogue' in r) {
    return r as unknown as Scene;
  }

  const dialogue =
    typeof r.voiceover === 'string' && r.voiceover.length > 0
      ? { speaker: 'narrator' as const, text: r.voiceover }
      : null;

  const { voiceover: _strip, ...rest } = r;
  void _strip;

  return {
    scene_id: rest.scene_id,
    description: rest.description,
    duration_sec: rest.duration_sec,
    dialogue,
    character_ids: rest.character_ids ?? [],
    composition_hint: rest.composition_hint,
    first_frame_source: rest.first_frame_source ?? 'auto_continuity',
    first_frame: rest.first_frame ?? null,
    last_frame: rest.last_frame ?? null,
    video: rest.video ?? null,
    voice_audio: rest.voice_audio ?? null,
    final_clip: rest.final_clip ?? null,
  } as Scene;
}
