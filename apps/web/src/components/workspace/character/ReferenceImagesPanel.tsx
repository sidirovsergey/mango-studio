'use client';

import { createBrowserClient } from '@/lib/supabase-browser';
import { removeReferenceImageAction } from '@/server/actions/removeReferenceImageAction';
import { uploadReferenceImageAction } from '@/server/actions/uploadReferenceImageAction';
import type { Character } from '@mango/core';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

interface Props {
  projectId: string;
  character: Character;
  initialFocus?: boolean;
  referenceUrls: string[];
}

export function ReferenceImagesPanel({ projectId, character, initialFocus, referenceUrls }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [refError, setRefError] = useState<string | null>(null);
  const referenceImages = character.reference_images ?? [];

  const handleUploadClick = () => {
    setRefError(null);
    fileInput.current?.click();
  };

  const handleFile = async (file: File) => {
    setRefError(null);
    const sb = createBrowserClient();
    const userId = (await sb.auth.getUser()).data.user?.id;
    if (!userId) {
      setRefError('Сессия истекла, обнови страницу');
      return;
    }
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${userId}/${projectId}/${character.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('character-references').upload(path, file);
    if (error) {
      console.error('upload failed', error);
      setRefError(`Загрузка не удалась: ${error.message}`);
      return;
    }
    startTransition(async () => {
      const r = await uploadReferenceImageAction({
        project_id: projectId,
        character_id: character.id,
        supabase_path: path,
      });
      if (!r.ok) {
        setRefError(r.error);
        return;
      }
      router.refresh();
    });
  };

  const removeAt = (idx: number) => {
    setRefError(null);
    startTransition(async () => {
      const r = await removeReferenceImageAction({
        project_id: projectId,
        character_id: character.id,
        ref_index: idx,
      });
      if (!r.ok) {
        setRefError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="refs-panel" data-focus={initialFocus ? 'true' : undefined}>
      <div className="char-modal-section-title">Референсы ({referenceImages.length})</div>

      <div className="refs-grid">
        {referenceImages.map((r, i) => (
          <div
            key={r.storage.kind === 'fal_passthrough' ? r.storage.url : r.storage.path}
            className="ref-thumb"
          >
            <img src={referenceUrls[i] ?? ''} alt={`reference ${i + 1}`} />
            <button
              type="button"
              className="ref-remove"
              onClick={() => removeAt(i)}
              disabled={isPending}
              aria-label="Удалить референс"
            >
              ×
            </button>
          </div>
        ))}
        <button onClick={handleUploadClick} className="ref-add" disabled={isPending} type="button">
          + Загрузить
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      {refError && <div className="char-modal-error">⚠ {refError}</div>}
    </div>
  );
}
