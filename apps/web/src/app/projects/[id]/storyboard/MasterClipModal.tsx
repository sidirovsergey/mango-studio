'use client';

import type { MasterClip, Scene } from '@mango/core';
import { useEffect, useRef } from 'react';

interface MasterClipModalProps {
  masterClip: MasterClip;
  scenes: Scene[];
  onClose: () => void;
}

function resolveUrl(clip: MasterClip): string | null {
  const s = clip.storage;
  if (s.kind === 'fal_passthrough') {
    return s.url;
  }
  // supabase storage — placeholder route; will be replaced when signed-url route lands
  return `/api/storage/${s.path}`;
}

function isStale(clip: MasterClip, scenes: Scene[]): boolean {
  const currentIds = scenes
    .map((s) => s.scene_id)
    .sort()
    .join(',');
  const snapshotIds = [...clip.scene_ids_snapshot].sort().join(',');
  if (currentIds !== snapshotIds) return true;
  // Also stale if any scene was modified after master gen
  const masterAt = clip.generated_at;
  return scenes.some((s) => {
    const sceneUpdatedAt =
      s.final_clip?.generated_at ?? s.video?.generated_at ?? s.first_frame?.generated_at ?? null;
    return sceneUpdatedAt != null && sceneUpdatedAt > masterAt;
  });
}

export function MasterClipModal({ masterClip, scenes, onClose }: MasterClipModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const videoUrl = resolveUrl(masterClip);
  const stale = isStale(masterClip, scenes);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop scrim — Esc handled by document-level listener
    <div className="modal-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="master-modal" role="dialog" aria-modal="true" aria-label="Мастер-клип">
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>

        <h3 className="modal-title">Мастер-клип</h3>

        {stale && (
          <div className="stale-warn">
            ⚠ Сцены изменились после генерации — пересоберите мастер для актуальной версии
          </div>
        )}

        <div className="master-player">
          {videoUrl ? (
            // biome-ignore lint/a11y/useMediaCaption: AI-generated video, no caption track yet (post-launch backlog)
            <video src={videoUrl} autoPlay controls loop playsInline className="master-video" />
          ) : (
            <div className="master-no-url">Видео недоступно</div>
          )}
        </div>

        <div className="modal-footer">
          {videoUrl && (
            <a
              href={videoUrl}
              download="master-clip.mp4"
              className="download-btn"
              target="_blank"
              rel="noreferrer"
            >
              ⬇ Скачать MP4
            </a>
          )}
          <span className="modal-meta">
            Сгенерирован: {new Date(masterClip.generated_at).toLocaleString('ru-RU')}
          </span>
        </div>
      </div>
    </div>
  );
}
