'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Character } from '@mango/core'
import { uploadReferenceImageAction } from '@/server/actions/uploadReferenceImageAction'
import { generateReferenceImageAction } from '@/server/actions/generateReferenceImageAction'
import { removeReferenceImageAction } from '@/server/actions/removeReferenceImageAction'
import { createBrowserClient } from '@/lib/supabase-browser'

interface Props {
  projectId: string
  character: Character
  initialFocus?: boolean
  referenceUrls: string[]
}

export function ReferenceImagesPanel({ projectId, character, initialFocus, referenceUrls }: Props) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const sb = createBrowserClient()

  const handleUploadClick = () => fileInput.current?.click()

  const handleFile = async (file: File) => {
    const userId = (await sb.auth.getUser()).data.user?.id
    if (!userId) return
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${userId}/${projectId}/${character.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await sb.storage.from('character-references').upload(path, file)
    if (error) {
      console.error('upload failed', error)
      return
    }
    startTransition(async () => {
      await uploadReferenceImageAction({
        project_id: projectId,
        character_id: character.id,
        supabase_path: path,
      })
      router.refresh()
    })
  }

  const generateAi = () => {
    startTransition(async () => {
      await generateReferenceImageAction({
        project_id: projectId,
        character_id: character.id,
        guidance_prompt: aiPrompt || undefined,
      })
      setAiOpen(false)
      setAiPrompt('')
      router.refresh()
    })
  }

  const removeAt = (idx: number) => {
    startTransition(async () => {
      await removeReferenceImageAction({
        project_id: projectId,
        character_id: character.id,
        ref_index: idx,
      })
      router.refresh()
    })
  }

  return (
    <div className="refs-panel" data-focus={initialFocus ? 'true' : undefined}>
      <div className="char-modal-section-title">
        Референсы ({character.reference_images.length})
      </div>

      <div className="refs-grid">
        {character.reference_images.map((r, i) => (
          <div key={i} className="ref-thumb">
            <img src={referenceUrls[i] ?? ''} alt={`reference ${i + 1}`} />
            <button
              className="ref-remove"
              onClick={() => removeAt(i)}
              disabled={isPending}
              aria-label="Удалить референс"
            >×</button>
          </div>
        ))}
        <button onClick={handleUploadClick} className="ref-add" disabled={isPending} type="button">
          + Загрузить
        </button>
        <button onClick={() => setAiOpen(true)} className="ref-add" disabled={isPending || !character.dossier} type="button">
          ✨ AI-вариант
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />

      {aiOpen && (
        <div className="ai-prompt-row">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="опционально: подсказка для variation"
          />
          <button onClick={generateAi} disabled={isPending}>Сгенерировать</button>
          <button onClick={() => setAiOpen(false)}>Отмена</button>
        </div>
      )}
    </div>
  )
}
