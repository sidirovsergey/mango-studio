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
  // Suppress stale error pill once a dossier has been successfully generated —
  // the page-level query only loads non-terminal jobs, so an old `error` row
  // would otherwise persist visually on top of a real avatar after a later
  // successful regen.
  const showError = !generating && Boolean(generationError) && !character.dossier?.avatar;
  return (
    <div className={className} data-character-id={character.id}>
      <Link href={`?char=${character.id}`} scroll={false} className="char-card-clickable">
        <div className="char-avatar">
          {character.dossier?.avatar ? (
            // Phase 1.2.6 fix-6: key={generated_at} forces unmount/remount on
            // regen — without this <img src> updates via React reconciliation
            // but the browser serves the cached image until a full SSR pass.
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
          {showError && (
            <div className="char-job-status error" title={generationError ?? undefined}>
              Не удалось сгенерировать досье
            </div>
          )}
        </div>
      </Link>
      <CharacterCardActions
        projectId={projectId}
        character={character}
        generating={generating}
        generationError={showError ? generationError : null}
      />
    </div>
  );
}
