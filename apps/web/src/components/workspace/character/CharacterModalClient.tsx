'use client';

import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction';
import { setCharacterVoiceAction } from '@/server/actions/setCharacterVoiceAction';
import { updateCharacterFieldAction } from '@/server/actions/updateCharacterFieldAction';
import { type Character, VOICE_POOL, buildDossierPrompt } from '@mango/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  const [ttsProvider, setTtsProvider] = useState<'grok' | 'elevenlabs'>(
    character.voice.tts_provider ?? 'elevenlabs',
  );

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
              <button type="button" onClick={() => setRegenSuggested(false)} disabled={isPending}>
                Не сейчас
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isPending}
                className="primary"
              >
                {isPending ? 'Генерирую...' : 'Перегенерировать'}
              </button>
            </div>
          </div>
        )}
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
        <VoicePicker projectId={projectId} character={character} />
        <div className="tts-provider-toggle">
          <label>
            <input
              type="radio"
              name="tts"
              checked={ttsProvider === 'grok'}
              onChange={() => {
                setTtsProvider('grok');
                saveField({ voice: { tts_provider: 'grok' } });
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
                saveField({ voice: { tts_provider: 'elevenlabs' } });
              }}
            />
            ElevenLabs
          </label>
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

// ---------------- VoicePicker ----------------
function VoicePicker({ projectId, character }: { projectId: string; character: Character }) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [showAdv, setShowAdv] = useState(false);
  const [advId, setAdvId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (voice: { id: string; label: string }) => {
    setError(null);
    startT(async () => {
      const r = await setCharacterVoiceAction({
        project_id: projectId,
        character_id: character.id,
        voice_id: voice.id,
        voice_label: voice.label,
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const handleAdvanced = () => {
    if (!advId.match(/^[A-Za-z0-9]{20}$/)) {
      setError('voice_id must be 20 alphanumeric chars');
      return;
    }
    setError(null);
    startT(async () => {
      const r = await setCharacterVoiceAction({
        project_id: projectId,
        character_id: character.id,
        voice_id: advId,
        voice_label: 'Custom',
        advanced: true,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setShowAdv(false);
      setAdvId('');
      router.refresh();
    });
  };

  return (
    <div className="voice-picker">
      <span className="voice-label">🗣️ Голос:</span>
      <select
        className="voice-select"
        value={character.voice_id ?? ''}
        onChange={(e) => {
          const v = VOICE_POOL.find((x) => x.id === e.target.value);
          if (v) handleSelect({ id: v.id, label: v.label });
        }}
        disabled={pending}
      >
        <option value="">— не задан —</option>
        {VOICE_POOL.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label} ({v.gender}, {v.tone})
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setShowAdv((x) => !x)}
        title="Custom voice_id"
      >
        ✎ adv
      </button>
      {showAdv && (
        <div className="adv-popover">
          <input
            type="text"
            placeholder="ElevenLabs voice_id (20 chars)"
            value={advId}
            onChange={(e) => setAdvId(e.target.value)}
          />
          <button type="button" className="btn primary" onClick={handleAdvanced} disabled={pending}>
            применить
          </button>
        </div>
      )}
      {error && <span className="voice-error">⚠ {error}</span>}
    </div>
  );
}
