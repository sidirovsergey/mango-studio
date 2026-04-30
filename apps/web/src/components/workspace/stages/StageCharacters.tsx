import { getCharactersForUI } from '@/server/lib/get-characters-for-ui';
import type { PersistedScript } from '@mango/core';
import { getDefaultModel } from '@mango/core';
import type { Tier } from '@mango/core';
import { AddCharacterCard } from '../character/AddCharacterCard';
import { CharacterCard } from '../character/CharacterCard';

interface Props {
  projectId: string;
  script: PersistedScript | null;
  tier: Tier;
  style?: '3d_pixar' | '2d_drawn' | 'clay_art';
}

export async function StageCharacters({ projectId, script, tier, style: _style }: Props) {
  const characters = script?.characters;
  const { active } = getCharactersForUI(characters);

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
    </section>
  );
}
