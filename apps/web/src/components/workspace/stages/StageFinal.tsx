'use client';

import type { MasterClipVersion } from '@mango/core';
import { StageGate } from '../StageGate';
import { StageHead } from '../shared/StageHead';
import { useStage04 } from './scenes/Stage04Provider';

interface Props {
  projectId: string;
  projectStatus: string;
}

function resolveUrl(clip: MasterClipVersion): string | null {
  const s = clip.storage;
  if (s.kind === 'fal_passthrough') return s.url;
  return `/api/storage/${s.path}`;
}

export function StageFinal({ projectStatus }: Props) {
  const unlocked = ['scenes_ready', 'final_ready'].includes(projectStatus);

  return (
    <section className="stage" data-stage id="finalStage">
      <StageHead num="05" title="Финал" />
      <StageGate unlocked={unlocked} scrollToStageId="scenesStage" hint="Сначала собери все сцены">
        <StageFinalBody />
      </StageGate>
    </section>
  );
}

function StageFinalBody() {
  const { script, jobs } = useStage04();
  const scenes = script?.scenes ?? [];
  const versions = script?.master_clip_versions ?? [];
  const activeId = script?.master_clip_active_version_id ?? null;
  const activeMaster = versions.find((m) => m.version_id === activeId) ?? null;

  const masterJob = jobs
    .filter((j) => j.kind === 'master_clip' && ['pending', 'running'].includes(j.status))
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];

  // Stale-check: any scene's active video changed since the master was composed.
  const isStale = (() => {
    if (!activeMaster) return false;
    const snapshotByScene = new Map(
      activeMaster.composed_from_scene_versions.map((c) => [c.scene_id, c.video_version_id]),
    );
    if (snapshotByScene.size !== scenes.length) return true;
    return scenes.some((s) => {
      const snap = snapshotByScene.get(s.scene_id);
      if (!snap) return true;
      return s.video_active_version_id !== snap;
    });
  })();

  // ─── State 1: generation in flight ──────────────────────────────────────
  if (masterJob) {
    return (
      <div className="final-state final-state-busy" aria-busy="true" aria-live="polite">
        <div className="final-spinner" />
        <h3 className="final-state-title">Собираю финальный ролик…</h3>
        <p className="final-state-sub">
          ffmpeg склеивает {scenes.length} сцен. Обычно 10–30 секунд.
        </p>
      </div>
    );
  }

  // ─── State 2: ready master ──────────────────────────────────────────────
  if (activeMaster) {
    const url = resolveUrl(activeMaster);
    const generatedAt = new Date(activeMaster.generated_at);
    const sizeLabel = `${scenes.length} сцен`;
    return (
      <div className="final-ready">
        {isStale && (
          <div className="final-stale" role="status">
            <span className="final-stale-tag">!</span>
            Сцены изменились после сборки — пересобери мастер, чтобы получить актуальную версию
          </div>
        )}

        <div className="final-player-frame">
          {url ? (
            // biome-ignore lint/a11y/useMediaCaption: AI-generated clip, no caption track yet
            <video src={url} controls loop playsInline className="final-player-video" />
          ) : (
            <div className="final-player-empty">Видео недоступно</div>
          )}
        </div>

        <div className="final-meta">
          <div className="final-meta-line">
            <span className="final-meta-tag">FINAL</span>
            <span>{sizeLabel}</span>
            <span className="dot" aria-hidden>
              ·
            </span>
            <span>
              Собран {generatedAt.toLocaleDateString('ru-RU')}{' '}
              {generatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {versions.length > 1 && (
              <>
                <span className="dot" aria-hidden>
                  ·
                </span>
                <span>версия {versions.findIndex((v) => v.version_id === activeId) + 1}</span>
              </>
            )}
          </div>
          {url && (
            <a
              href={url}
              download="master-clip.mp4"
              className="final-download"
              target="_blank"
              rel="noreferrer"
            >
              Скачать MP4
            </a>
          )}
        </div>
      </div>
    );
  }

  // ─── State 3: no master yet — empty CTA hint ────────────────────────────
  return (
    <div className="final-state final-state-empty">
      <div className="final-state-icon" aria-hidden>
        ▶
      </div>
      <h3 className="final-state-title">Финальный ролик ещё не собран</h3>
      <p className="final-state-sub">
        Когда все сцены будут готовы, нажми «Финализировать ролик» в Stage 04.
        <br />
        Готовый mp4 появится здесь — с превью, скачиванием и историей версий.
      </p>
    </div>
  );
}
