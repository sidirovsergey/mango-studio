import { CharacterModal } from '@/components/workspace/character/CharacterModal';
import { Workspace } from '@/components/workspace/Workspace';
import { StageCharacters } from '@/components/workspace/stages/StageCharacters';
import { getCurrentUserId } from '@/lib/auth/get-user';
import { getCharactersForUI } from '@/server/lib/get-characters-for-ui';
import type { PersistedScript, Tier } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ char?: string; tab?: string }>;
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  await getCurrentUserId();
  const supabase = await getServerSupabase();

  const [projectResult, messagesResult] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, idea, style, format, target_duration_sec, script, title, status, auto_mode, user_id, created_at, updated_at, tier',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('chat_messages')
      .select('id, project_id, role, content, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: true }),
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
    />
  );

  return (
    <>
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
