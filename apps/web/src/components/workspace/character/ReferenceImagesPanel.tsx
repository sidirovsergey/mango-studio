'use client';

import { createBrowserClient } from '@/lib/supabase-browser';
import { generateReferenceImageAction } from '@/server/actions/generateReferenceImageAction';
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
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

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

  const generateAi = () => {
    setRefError(null);
    startTransition(async () => {
      const r = await generateReferenceImageAction({
        project_id: projectId,
        character_id: character.id,
        guidance_prompt: aiPrompt || undefined,
      });
      if (!r.ok) {
        setRefError(r.error);
        return;
      }
      setAiOpen(false);
      setAiPrompt('');
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
      <div className="char-modal-section-title">
        Референсы ({character.reference_images.length})
      </div>

      <div className="refs-grid">
        {character.reference_images.map((r, i) => (
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
        <button
          onClick={() => {
            setRefError(null);
            if (!character.dossier) {
              setRefError(
                'Сначала сгенерируй основное досье — оно используется как seed для AI-вариантов',
              );
              return;
            }
            setAiOpen(true);
          }}
          className="ref-add"
          disabled={isPending}
          type="button"
          title={
            character.dossier
              ? 'Сгенерировать AI-вариацию на основе текущего досье'
              : 'Нужно сначала сгенерировать основное досье'
          }
        >
          ✨ AI-вариант
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

      {aiOpen && (
        <div className="ai-prompt-row">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="опционально: подсказка для variation"
          />
          <button type="button" onClick={generateAi} disabled={isPending} className="primary">
            {isPending ? 'Генерирую...' : 'Сгенерировать'}
          </button>
          <button type="button" onClick={() => setAiOpen(false)} disabled={isPending}>
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}
