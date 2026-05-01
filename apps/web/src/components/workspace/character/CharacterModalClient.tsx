'use client';

import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { updateCharacterFieldAction } from '@/server/actions/updateCharacterFieldAction';
import { buildDossierPrompt, type Character } from '@mango/core';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ReferenceImagesPanel } from './ReferenceImagesPanel';

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
  voice?: { description?: string; tts_provider?: 'grok' | 'elevenlabs' };
};

export function CharacterModalClient({ projectId, character, initialTab, referenceUrls, style = '3d_pixar' }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.description);
  const initialFullPrompt = character.full_prompt || buildDossierPrompt(
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
  const [genError, setGenError] = useState<string | null>(null);
  const [voiceDesc, setVoiceDesc] = useState(character.voice.description ?? '');
  const [ttsProvider, setTtsProvider] = useState<'grok' | 'elevenlabs'>(
    character.voice.tts_provider ?? 'elevenlabs',
  );

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete('char');
    next.delete('tab');
    const qs = next.toString();
    router.push(qs ? `?${qs}` : '?', { scroll: false });
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

      router.refresh();
    });
  };

  const handleGenerate = () => {
    setGenError(null);
    startTransition(async () => {
      const r = await generateCharacterDossierAction({
        project_id: projectId,
        character_id: character.id,
        custom_prompt: fullPrompt || undefined,
      });
      if (!r.ok) {
        setGenError(r.error);
        console.error('[generateDossier]', r.error, r);
        return;
      }
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
          {promptSynced && <span className="prompt-synced-hint"> · обновлён под новое описание</span>}
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
        <div className="char-modal-section-actions">
          <button type="button" onClick={handleGenerate} disabled={isPending} className="primary">
            {isPending
              ? 'Генерирую...'
              : character.dossier
                ? 'Перегенерировать досье'
                : 'Сгенерировать досье'}
          </button>
        </div>
        {genError && <div className="char-modal-error">⚠ {genError}</div>}
      </section>

      <section className="char-modal-section">
        <div className="char-modal-section-title">Голос</div>
        <input
          className="voice-input"
          value={voiceDesc}
          onChange={(e) => setVoiceDesc(e.target.value)}
          onBlur={() =>
            voiceDesc !== (character.voice.description ?? '') &&
            saveField({ voice: { description: voiceDesc, tts_provider: ttsProvider } })
          }
          placeholder="например: тёплый баритон, спокойная уверенность"
        />
        <div className="tts-provider-toggle">
          <label>
            <input
              type="radio"
              name="tts"
              checked={ttsProvider === 'grok'}
              onChange={() => {
                setTtsProvider('grok');
                saveField({ voice: { description: voiceDesc, tts_provider: 'grok' } });
              }}
            />
            Grok
          </label>
          <label>
            <input
              type="radio"
              name="tts"
              checked={ttsProvider === 'elevenlabs'}
              onChange={() => {
                setTtsProvider('elevenlabs');
                saveField({ voice: { description: voiceDesc, tts_provider: 'elevenlabs' } });
              }}
            />
            ElevenLabs
          </label>
          <span className="tts-note">(генерация TTS будет в Phase 1.3)</span>
        </div>
      </section>

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
