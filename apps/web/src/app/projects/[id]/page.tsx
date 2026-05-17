import { ProjectJobsPoller } from '@/components/workspace/ProjectJobsPoller';
import { Workspace } from '@/components/workspace/Workspace';
import { CharacterModal } from '@/components/workspace/character/CharacterModal';
import {
  type CharacterJobSummary,
  StageCharacters,
} from '@/components/workspace/stages/StageCharacters';
import { getCurrentUserId } from '@/lib/auth/get-user';
import { getCharactersForUI } from '@/server/lib/get-characters-for-ui';
import type { PersistedScript, Tier } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { notFound } from 'next/navigation';

// Codex audit P1.2: maxDuration must be exported from a route file (page /
// layout / route handler), NOT from a server-action module. Server actions
// invoked from this page inherit the page's budget. Script generation runs
// Grok 4.1 Fast which can take 30-90s for a 60s/6-scene premium script with
// the post-2026-05-13 enriched output schema; Vercel default is 10s hobby /
// 60s pro, so we raise to 120s here so the happy path doesn't get 504'd
// mid-stream. The duplicate `export const maxDuration` on scripts.ts is
// now a no-op (Next.js silently ignores it on non-route modules) but
// removed for clarity in the same commit.
// Ref: https://nextjs.org/docs/15/app/api-reference/file-conventions/route-segment-config#maxduration
export const maxDuration = 120;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ char?: string; tab?: string }>;
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  await getCurrentUserId();
  const supabase = await getServerSupabase();

  const [projectResult, messagesResult, characterJobsResult] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, idea, style, format, target_duration_sec, script, title, status, auto_mode, user_id, created_at, updated_at, tier',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('chat_messages')
      .select('id, project_id, role, content, created_at, tool_chips, pending_action')
      .eq('project_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('media_jobs')
      .select('id, character_id, kind, status, error_code, created_at')
      .eq('project_id', id)
      .in('kind', ['character_dossier', 'character_avatar'])
      .in('status', ['reserved', 'pending', 'running', 'error'])
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (projectResult.error || !projectResult.data) {
    return notFound();
  }

  const project = projectResult.data;
  const expandedCharacterId = typeof sp.char === 'string' ? sp.char : undefined;
  const modalTab = sp.tab === 'refs' ? ('refs' as const) : ('main' as const);
  const style = (project.style as '3d_pixar' | '2d_drawn' | 'clay_art' | null) ?? '3d_pixar';

  const script = project.script as PersistedScript | null;
  const { active: activeCharacters } = getCharactersForUI(script?.characters);
  const expandedCharacter = expandedCharacterId
    ? activeCharacters.find((c) => c.id === expandedCharacterId)
    : undefined;

  const charactersSlot = (
    <StageCharacters
      projectId={project.id}
      script={script}
      tier={project.tier as Tier}
      style={style}
      characterJobs={(characterJobsResult.data ?? []) as CharacterJobSummary[]}
    />
  );

  return (
    <>
      <ProjectJobsPoller projectId={project.id} />
      <Workspace
        project={project}
        initialChatMessages={messagesResult.data ?? []}
        charactersSlot={charactersSlot}
      />
      {expandedCharacter && (
        <CharacterModal
          projectId={project.id}
          character={expandedCharacter}
          initialTab={modalTab}
          style={style}
        />
      )}
    </>
  );
}
