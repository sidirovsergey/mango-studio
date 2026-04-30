'use client'

import { useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCharacterAction } from '@/server/actions/deleteCharacterAction'

interface Props {
  projectId: string
  characterId: string
  characterName: string
  onClose(): void
}

export function DeleteCharacterPopover({ projectId, characterId, characterName, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onClick) }
  }, [onClose])

  const confirm = () => {
    startTransition(async () => {
      await deleteCharacterAction({ project_id: projectId, character_id: characterId })
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="delete-popover" ref={ref}>
      <div className="popover-text">
        Удалить <strong>{characterName}</strong>? Hard-delete: dossier и references стираются с
        Storage. Действие необратимо.
      </div>
      <div className="popover-actions">
        <button onClick={onClose} disabled={isPending}>Отмена</button>
        <button onClick={confirm} disabled={isPending} className="danger">
          {isPending ? 'Удаляю...' : 'Удалить'}
        </button>
      </div>
    </div>
  )
}
