'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { refineCharacterAction } from '@/server/actions/refineCharacterAction'

interface Props {
  projectId: string
  characterId: string
  onClose(): void
}

export function RefineCharacterPopover({ projectId, characterId, onClose }: Props) {
  const [text, setText] = useState('')
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

  const submit = () => {
    if (!text.trim()) return
    startTransition(async () => {
      await refineCharacterAction({ project_id: projectId, character_id: characterId, instruction: text })
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="refine-popover" ref={ref}>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="например: сделай очки круглыми вместо квадратных"
        rows={3}
      />
      <div className="popover-actions">
        <button onClick={onClose} disabled={isPending}>Отмена</button>
        <button onClick={submit} disabled={isPending || !text.trim()} className="primary">
          {isPending ? 'Применяю...' : 'Применить'}
        </button>
      </div>
    </div>
  )
}
