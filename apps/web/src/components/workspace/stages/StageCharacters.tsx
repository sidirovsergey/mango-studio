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
  characterJobs?: CharacterJobSummary[];
}

export interface CharacterJobSummary {
  id: string;
  character_id: string | null;
  kind: string;
  status: string;
  error_code: string | null;
  created_at: string | null;
}

const ACTIVE_JOB_STATUSES = new Set(['reserved', 'pending', 'running']);

function summarizeCharacterJobs(characterId: string, jobs: CharacterJobSummary[] | undefined) {
  const charJobs = (jobs ?? []).filter((j) => j.character_id === characterId);
  const active = charJobs.find((j) => ACTIVE_JOB_STATUSES.has(j.status));
  if (active) return { generating: true, error: null };

  const failed = charJobs.find((j) => j.status === 'error');
  if (failed) {
    return {
      generating: false,
      error: failed.error_code ?? 'generation_failed',
    };
  }

  return { generating: false, error: null };
}

export async function StageCharacters({
  projectId,
  script,
  tier,
  style: _style,
  characterJobs,
}: Props) {
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
        {active.map((c) => {
          const job = summarizeCharacterJobs(c.id, characterJobs);
          return (
            <CharacterCard
              key={c.id}
              projectId={projectId}
              character={c}
              generating={job.generating}
              generationError={job.error}
            />
          );
        })}
        <AddCharacterCard projectId={projectId} />
      </div>
    </section>
  );
}
