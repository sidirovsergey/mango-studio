import { getCharactersForUI } from '@/server/lib/get-characters-for-ui';
import type { PersistedScript } from '@mango/core';
import { getDefaultModel } from '@mango/core';
import type { Tier } from '@mango/core';
import { AddCharacterCard } from '../character/AddCharacterCard';
import { CharacterCard } from '../character/CharacterCard';
import { CharacterModal } from '../character/CharacterModal';

interface Props {
  projectId: string;
  script: PersistedScript | null;
  tier: Tier;
  expandedCharacterId?: string;
  modalTab?: 'main' | 'refs';
}

export async function StageCharacters({
  projectId,
  script,
  tier,
  expandedCharacterId,
  modalTab,
}: Props) {
  const characters = script?.characters;
  const { active } = getCharactersForUI(characters);
  const expanded = expandedCharacterId ? active.find((c) => c.id === expandedCharacterId) : null;

  return (
    <section className="stage" id="charactersStage" data-stage>
      <div className="stage-head">
        <span className="stage-num">02</span>
        <div className="stage-title">Персонажи</div>
        <span className="section-tag">
          <span className="dot" data-state={active.length > 0 ? 'ready' : 'pending'} />
          {active.length} {active.length === 1 ? 'персонаж' : 'персонажей'}
        </span>
        <div style={{ flex: 1 }} />
        <div className="stage-meta">{getDefaultModel(tier)}</div>
      </div>

      <div className="char-grid">
        {active.map((c) => (
          <CharacterCard key={c.id} projectId={projectId} character={c} />
        ))}
        <AddCharacterCard projectId={projectId} />
      </div>

      {expanded && (
        <CharacterModal
          projectId={projectId}
          character={expanded}
          initialTab={modalTab ?? 'main'}
        />
      )}
    </section>
  );
}
