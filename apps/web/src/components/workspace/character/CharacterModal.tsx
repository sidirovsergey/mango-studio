import { getDisplayUrl } from '@/server/lib/storage-display-url';
import type { Character } from '@mango/core';
import { CharacterModalClient } from './CharacterModalClient';
import { DossierImage } from './DossierImage';

interface Props {
  projectId: string;
  character: Character;
  initialTab?: 'main' | 'refs';
  style?: '3d_pixar' | '2d_drawn' | 'clay_art';
}

export async function CharacterModal({ projectId, character, initialTab = 'main', style }: Props) {
  const refUrls = await Promise.all(
    character.reference_images.map((r) => getDisplayUrl(r.storage, 'character-references')),
  );

  return (
    <div className="char-modal-backdrop" data-modal-open>
      <div
        className="char-modal"
        role="dialog"
        aria-label={`Редактирование ${character.name}`}
        aria-modal="true"
      >
        {character.dossier ? (
          <div className="char-modal-hero">
            <DossierImage
              storage={character.dossier.storage}
              bucket="character-dossiers"
              alt={`${character.name} dossier`}
            />
          </div>
        ) : (
          <div className="char-modal-hero placeholder">
            <span>Досье ещё не сгенерировано</span>
          </div>
        )}
        <CharacterModalClient
          projectId={projectId}
          character={character}
          initialTab={initialTab}
          referenceUrls={refUrls}
          style={style}
        />
      </div>
    </div>
  );
}
