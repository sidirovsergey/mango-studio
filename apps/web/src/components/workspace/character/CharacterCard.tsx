import type { Character } from '@mango/core';
import Link from 'next/link';
import { CharacterCardActions } from './CharacterCardActions';
import { DossierImage } from './DossierImage';

interface Props {
  projectId: string;
  character: Character;
  generating?: boolean;
}

export function CharacterCard({ projectId, character, generating }: Props) {
  const className = `char-card${generating ? ' generating' : ''}`;
  return (
    <div className={className} data-character-id={character.id}>
      <Link href={`?char=${character.id}`} scroll={false} className="char-card-clickable">
        <div className="char-avatar">
          {character.dossier?.avatar ? (
            // Phase 1.2.6 fix-6: key={generated_at} форсирует unmount/remount
            // при regen — без этого <img src> обновляется через React reconciliation,
            // но браузер показывает старую закешированную картинку до навигации
            // (open/close модалки) которая делает full SSR.
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
        </div>
      </Link>
      <CharacterCardActions projectId={projectId} character={character} />
    </div>
  );
}
