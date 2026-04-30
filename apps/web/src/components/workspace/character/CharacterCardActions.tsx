'use client'

import type { Character } from '@mango/core'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateCharacterDossierAction } from '@/server/actions/generateCharacterDossierAction'
import { RefineCharacterPopover } from './RefineCharacterPopover'
import { ModelSelectorPopover } from './ModelSelectorPopover'
import { DeleteCharacterPopover } from './DeleteCharacterPopover'

interface Props {
  projectId: string
  character: Character
}

export function CharacterCardActions({ projectId, character }: Props) {
  const [isPending, startTransition] = useTransition()
  const [openPop, setOpenPop] = useState<null | 'refine' | 'model' | 'delete'>(null)
  const [regenError, setRegenError] = useState<string | null>(null)
  const router = useRouter()

  const handleRegen = (e: React.MouseEvent) => {
    e.stopPropagation()
    startTransition(async () => {
      const r = await generateCharacterDossierAction({
        project_id: projectId,
        character_id: character.id,
      })
      if (!r.ok) {
        setRegenError(r.error)
        console.error('regen failed', r.error)
      } else {
        setRegenError(null)
        router.refresh()
      }
    })
  }

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }

  const openRef = () => {
    router.push(`?char=${character.id}&tab=refs`, { scroll: false })
  }

  return (
    <div className="char-actions" onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" disabled={isPending} onClick={handleRegen} title="Перегенерировать" aria-label="Перегенерировать">
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/></svg>
      </button>
      <button className="icon-btn" onClick={stop(() => setOpenPop('refine'))} title="Уточнить промптом" aria-label="Уточнить промптом">
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20l4-4M3 21l3-9 9-9 6 6-9 9-9 3z"/></svg>
      </button>
      <button className="icon-btn" onClick={stop(() => setOpenPop('model'))} title="Сменить модель" aria-label="Сменить модель">
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <button className="icon-btn" onClick={stop(openRef)} title="Прикрепить референс" aria-label="Прикрепить референс">
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </button>
      <button className="icon-btn" onClick={stop(() => setOpenPop('delete'))} title="Удалить" aria-label="Удалить">
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>

      {regenError && <span className="regen-error" title={regenError}>!</span>}

      {openPop === 'refine' && (
        <RefineCharacterPopover
          projectId={projectId}
          characterId={character.id}
          onClose={() => setOpenPop(null)}
        />
      )}
      {openPop === 'model' && (
        <ModelSelectorPopover
          projectId={projectId}
          character={character}
          onClose={() => setOpenPop(null)}
        />
      )}
      {openPop === 'delete' && (
        <DeleteCharacterPopover
          projectId={projectId}
          characterId={character.id}
          characterName={character.name}
          onClose={() => setOpenPop(null)}
        />
      )}
    </div>
  )
}
