import type { Character } from '@mango/core'
import Link from 'next/link'
import { DossierImage } from './DossierImage'
import { CharacterCardActions } from './CharacterCardActions'

interface Props {
  projectId: string
  character: Character
  generating?: boolean
}

export function CharacterCard({ projectId, character, generating }: Props) {
  const className = `char-card${generating ? ' generating' : ''}`
  return (
    <div className={className} data-character-id={character.id}>
      <Link href={`?char=${character.id}`} scroll={false} className="char-card-clickable">
        <div className="char-avatar">
          {character.dossier ? (
            <DossierImage
              storage={character.dossier.storage}
              bucket="character-dossiers"
              alt={character.name}
              faceCrop
            />
          ) : (
            <span aria-hidden="true">{character.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="char-info">
          <div className="char-name">{character.name}</div>
          <div className="char-desc">{character.description || 'без описания'}</div>
        </div>
      </Link>
      <CharacterCardActions projectId={projectId} character={character} />
    </div>
  )
}
