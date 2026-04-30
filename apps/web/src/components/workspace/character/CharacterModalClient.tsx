'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Character } from '@mango/core'
import { updateCharacterFieldAction } from '@/server/actions/updateCharacterFieldAction'
import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction'
import { ReferenceImagesPanel } from './ReferenceImagesPanel'

interface Props {
  projectId: string
  character: Character
  initialTab: 'main' | 'refs'
  referenceUrls: string[]
}

type Patch = {
  name?: string
  description?: string
  full_prompt?: string
  voice?: { description?: string; tts_provider?: 'grok' | 'elevenlabs' }
}

export function CharacterModalClient({ projectId, character, initialTab, referenceUrls }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(character.name)
  const [description, setDescription] = useState(character.description)
  const [fullPrompt, setFullPrompt] = useState(character.full_prompt)
  const [voiceDesc, setVoiceDesc] = useState(character.voice.description ?? '')
  const [ttsProvider, setTtsProvider] = useState<'grok' | 'elevenlabs'>(character.voice.tts_provider ?? 'elevenlabs')

  const close = () => {
    const next = new URLSearchParams(params.toString())
    next.delete('char')
    next.delete('tab')
    const qs = next.toString()
    router.push(qs ? `?${qs}` : '?', { scroll: false })
  }

  const saveField = (patch: Patch) => {
    startTransition(async () => {
      await updateCharacterFieldAction({ project_id: projectId, character_id: character.id, patch })
      router.refresh()
    })
  }

  const handleGenerate = () => {
    startTransition(async () => {
      await generateCharacterDossierAction({
        project_id: projectId,
        character_id: character.id,
        custom_prompt: fullPrompt || undefined,
      })
      router.refresh()
    })
  }

  return (
    <div className="char-modal-body">
      <button className="char-modal-close" onClick={close} aria-label="Закрыть">×</button>

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
        <div className="char-modal-section-title">Полный промпт (отправляется в генератор как есть)</div>
        <textarea
          className="full-prompt-input"
          value={fullPrompt}
          onChange={(e) => setFullPrompt(e.target.value)}
          onBlur={() => fullPrompt !== character.full_prompt && saveField({ full_prompt: fullPrompt })}
          rows={8}
        />
        <div className="char-modal-section-actions">
          <button onClick={handleGenerate} disabled={isPending} className="primary">
            {isPending ? 'Генерирую...' : character.dossier ? 'Перегенерировать досье' : 'Generate Dossier'}
          </button>
        </div>
      </section>

      <section className="char-modal-section">
        <div className="char-modal-section-title">Голос</div>
        <input
          className="voice-input"
          value={voiceDesc}
          onChange={(e) => setVoiceDesc(e.target.value)}
          onBlur={() => voiceDesc !== (character.voice.description ?? '') && saveField({ voice: { description: voiceDesc, tts_provider: ttsProvider } })}
          placeholder="например: warm baritone, calm authority"
        />
        <div className="tts-provider-toggle">
          <label>
            <input type="radio" name="tts" checked={ttsProvider === 'grok'} onChange={() => { setTtsProvider('grok'); saveField({ voice: { description: voiceDesc, tts_provider: 'grok' } }) }} />
            Grok
          </label>
          <label>
            <input type="radio" name="tts" checked={ttsProvider === 'elevenlabs'} onChange={() => { setTtsProvider('elevenlabs'); saveField({ voice: { description: voiceDesc, tts_provider: 'elevenlabs' } }) }} />
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
  )
}
