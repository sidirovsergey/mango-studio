'use client';

import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { updateCharacterFieldAction } from '@/server/actions/updateCharacterFieldAction';
import { type Character, buildDossierPrompt } from '@mango/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ReferenceImagesPanel } from './ReferenceImagesPanel';

// VoicePicker + setCharacterVoiceAction + VOICE_POOL removed 2026-05-13.
// Active video models bake character voices into the clip directly; no
// separate ElevenLabs picker. Old projects keep their voice_id on disk
// but the modal no longer surfaces a way to change it.

interface Props {
  projectId: string;
  character: Character;
  initialTab: 'main' | 'refs';
  referenceUrls: string[];
  style?: '3d_pixar' | '2d_drawn' | 'clay_art';
}

type Patch = {
  name?: string;
  description?: string;
  full_prompt?: string;
  voice?: { tts_provider?: 'grok' | 'elevenlabs' };
};

export function CharacterModalClient({
  projectId,
  character,
  initialTab,
  referenceUrls,
  style = '3d_pixar',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.description);
  const initialFullPrompt =
    character.full_prompt ||
    buildDossierPrompt(
      {
        name: character.name,
        description: character.description,
        appearance: character.appearance,
        personality: character.personality,
      },
      style,
    );
  const [fullPrompt, setFullPrompt] = useState(initialFullPrompt);
  const [promptSynced, setPromptSynced] = useState(false);
  const [regenSuggested, setRegenSuggested] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // ttsProvider state removed 2026-05-13 with the audio rip-out.

  /**
   * Дополнительный «жду fal» индикатор поверх useTransition's isPending.
   *
   * Проблема: `generateCharacterDossierAction` отправляет fal-задачу и
   * возвращается через ~2-3 секунды. `isPending` сразу сбрасывается, но
   * сам результат досье ещё ~15-20 секунд варится у fal и приходит в
   * `character.dossier` позже через `ProjectJobsPoller.router.refresh()`.
   * Юзер видит «кнопка не грузится → закрываю модалку», и пропускает
   * момент когда досье реально появилось.
   *
   * `pendingDossierBaseline` = snapshot `character.dossier?.generated_at`
   * на момент клика:
   *   - `undefined` → не ждём.
   *   - `null` → ждём первой генерации (досье ещё не было).
   *   - `string` → ждём regen'а (старая метка времени).
   *
   * `useEffect` снимает флаг, когда `generated_at` сменился относительно
   * baseline'а (значит ProjectJobsPoller'ом прилетел новый dossier).
   */
  const [pendingDossierBaseline, setPendingDossierBaseline] = useState<string | null | undefined>(
    undefined,
  );
  const currentGeneratedAt = character.dossier?.generated_at ?? null;
  const isWaitingForDossier = pendingDossierBaseline !== undefined;

  useEffect(() => {
    if (pendingDossierBaseline === undefined) return;
    if (currentGeneratedAt !== pendingDossierBaseline) {
      setPendingDossierBaseline(undefined);
    }
  }, [currentGeneratedAt, pendingDossierBaseline]);

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete('char');
    next.delete('tab');
    const qs = next.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    router.replace(target, { scroll: false });
  };

  const saveField = (patch: Patch) => {
    startTransition(async () => {
      await updateCharacterFieldAction({
        project_id: projectId,
        character_id: character.id,
        patch,
      });

      // Auto-resync full_prompt when source fields change
      if (patch.name !== undefined || patch.description !== undefined) {
        const nextName = patch.name ?? character.name;
        const nextDesc = patch.description ?? character.description;
        const rebuilt = buildDossierPrompt(
          {
            name: nextName,
            description: nextDesc,
            appearance: character.appearance,
            personality: character.personality,
          },
          style,
        );
        setFullPrompt(rebuilt);
        setPromptSynced(true);
        setTimeout(() => setPromptSynced(false), 3000);
        await updateCharacterFieldAction({
          project_id: projectId,
          character_id: character.id,
          patch: { full_prompt: rebuilt },
        });
      }

      // Suggest regen if a prompt-affecting field changed (only meaningful
      // when dossier already exists — first-time generation user clicks
      // the Generate button explicitly).
      if (
        character.dossier &&
        (patch.description !== undefined ||
          patch.full_prompt !== undefined ||
          patch.name !== undefined)
      ) {
        setRegenSuggested(true);
      }

      router.refresh();
    });
  };

  const handleGenerate = () => {
    setGenError(null);
    // Capture the current dossier timestamp BEFORE submitting so we can
    // detect when ProjectJobsPoller lands the freshly-generated dossier.
    // First-gen case: null baseline → cleared when generated_at becomes truthy.
    // Regen case: old timestamp → cleared when generated_at changes.
    setPendingDossierBaseline(currentGeneratedAt);
    startTransition(async () => {
      const r = await generateCharacterDossierAction({
        project_id: projectId,
        character_id: character.id,
        custom_prompt: fullPrompt || undefined,
      });
      if (!r.ok) {
        setGenError(r.error);
        // Action errored before fal even started — drop the waiting flag so
        // the user can retry without a stuck "Генерирую…" button.
        setPendingDossierBaseline(undefined);
        console.error('[generateDossier]', r.error, r);
        return;
      }
      setRegenSuggested(false);
      router.refresh();
    });
  };

  return (
    <div className="char-modal-body">
      <button type="button" className="char-modal-close" onClick={close} aria-label="Закрыть">
        ×
      </button>

      <section className="char-modal-section">
        <input
          className="char-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== character.name && saveField({ name })}
        />
        <textarea
          className="char-desc-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== character.description && saveField({ description })}
          rows={2}
          placeholder="Краткое описание (1-2 предложения)"
        />
      </section>

      <section className="char-modal-section">
        <div className="char-modal-section-title">
          Полный промпт (отправляется в генератор как есть)
          {promptSynced && (
            <span className="prompt-synced-hint"> · обновлён под новое описание</span>
          )}
        </div>
        <textarea
          className="full-prompt-input"
          value={fullPrompt}
          onChange={(e) => setFullPrompt(e.target.value)}
          onBlur={() =>
            fullPrompt !== character.full_prompt && saveField({ full_prompt: fullPrompt })
          }
          rows={8}
        />
        {regenSuggested && (
          <div className="regen-suggest">
            <span className="regen-suggest-text">
              Промпт изменён. Перегенерировать досье с учётом правок?
            </span>
            <div className="regen-suggest-actions">
              <button
                type="button"
                onClick={() => setRegenSuggested(false)}
                disabled={isPending || isWaitingForDossier}
              >
                Не сейчас
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isPending || isWaitingForDossier}
                className="primary"
              >
                {isPending || isWaitingForDossier ? 'Генерирую…' : 'Перегенерировать'}
              </button>
            </div>
          </div>
        )}
        <div className="char-modal-section-actions">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending || isWaitingForDossier}
            className="primary"
          >
            {isPending || isWaitingForDossier
              ? 'Генерирую… ~20с'
              : character.dossier
                ? 'Перегенерировать досье'
                : 'Сгенерировать досье'}
          </button>
        </div>
        {genError && <div className="char-modal-error">⚠ {genError}</div>}
      </section>

      {/*
        "Голос" section removed 2026-05-13: native-audio video models
        (Grok Imagine Video, Seedance 2.0 Pro, Veo 3.1) handle character
        voicing implicitly from the dialogue text + the character's
        description. The separate TTS pipeline + voice picker is gone.
      */}

      <section className="char-modal-section">
        <ReferenceImagesPanel
          projectId={projectId}
          character={character}
          initialFocus={initialTab === 'refs'}
          referenceUrls={referenceUrls}
        />
      </section>
    </div>
  );
}

// VoicePicker component deleted 2026-05-13 — see top-of-file comment.
