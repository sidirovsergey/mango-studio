import type { Character } from '@mango/core';
import Link from 'next/link';
import { CharacterCardActions } from './CharacterCardActions';
import { DossierImage } from './DossierImage';

interface Props {
  projectId: string;
  character: Character;
  generating?: boolean;
  generationError?: string | null;
}

export function CharacterCard({ projectId, character, generating, generationError }: Props) {
  const className = `char-card${generating ? ' generating' : ''}`;
  return (
    <div className={className} data-character-id={character.id}>
      <Link href={`?char=${character.id}`} scroll={false} className="char-card-clickable">
        <div className="char-avatar">
          {character.dossier?.avatar ? (
            <DossierImage
              key={character.dossier.generated_at}
              storage={character.dossier.avatar}
              cacheBust={character.dossier.generated_at}
              bucket="character-dossiers"
              alt={character.name}
            />
          ) : (
            <span aria-hidden="true">{character.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="char-info">
          <div className="char-name">{character.name}</div>
          <div className="char-desc">{character.description || 'без описания'}</div>
          {generating && <div className="char-job-status">Генерируется досье...</div>}
          {!generating && generationError && (
            <div className="char-job-status error" title={generationError}>
              Не удалось сгенерировать досье
            </div>
          )}
        </div>
      </Link>
      <CharacterCardActions
        projectId={projectId}
        character={character}
        generating={generating}
        generationError={generationError}
      />
    </div>
  );
}
