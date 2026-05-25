'use client';

import type { MasterClipVersion } from '@mango/core';
import { useScriptState } from '../ScriptStateProvider';
import { StageHead } from '../shared/StageHead';

interface Props {
  /** Kept for API compatibility — gating is now derived from live script
   * state instead of `project.status`, which often lags behind reality
   * (e.g. user has generated scenes but the column was never advanced). */
  projectId: string;
  projectStatus: string;
}

function resolveUrl(clip: MasterClipVersion): string | null {
  const s = clip.storage;
  if (s.kind === 'fal_passthrough') return s.url;
  return `/api/storage/${s.path}`;
}

export function StageFinal(_: Props) {
  return (
    <section className="stage" data-stage id="finalStage">
      <StageHead num="05" title="Финал" />
      <StageFinalBody />
    </section>
  );
}

function StageFinalBody() {
  const { script, jobs } = useScriptState();
  const scenes = script?.scenes ?? [];
  const versions = script?.master_clip_versions ?? [];
  const activeId = script?.master_clip_active_version_id ?? null;
  const activeMaster = versions.find((m) => m.version_id === activeId) ?? null;

  // No scenes yet — softest empty state, points back to earlier stages.
  // Replaces the old StageGate (`project.status` based) which often left
  // users locked out even when scenes were actually generated.
  if (scenes.length === 0) {
    return (
      <div className="final-state final-state-empty">
        <div className="final-state-icon" aria-hidden>
          ▶
        </div>
        <h3 className="final-state-title">Финал появится после сборки сцен</h3>
        <p className="final-state-sub">
          Сгенерируй сцены в Stage 04 «Сцены», затем нажми «Финализировать ролик».
          <br />
          Готовый mp4 окажется здесь — с превью, скачиванием и историей версий.
        </p>
      </div>
    );
  }

  const masterJob = jobs
    .filter(
      (j) => j.kind === 'master_clip' && ['reserved', 'pending', 'running'].includes(j.status),
    )
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
            {activeMaster.has_full_audio === true && (
              <>
                <span className="dot" aria-hidden>
                  ·
                </span>
                <span className="master-audio-badge ok">🎵 со звуком</span>
              </>
            )}
            {activeMaster.has_full_audio === false && (
              <>
                <span className="dot" aria-hidden>
                  ·
                </span>
                <span
                  className="master-audio-badge warn"
                  title="Часть сцен не озвучена. Вернись в Stage 04, доозвучь и пересобери ролик."
                >
                  🔇 без звука
                </span>
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
