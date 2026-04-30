import { Workspace } from '@/components/workspace/Workspace';
import { StageCharacters } from '@/components/workspace/stages/StageCharacters';
import { getCurrentUserId } from '@/lib/auth/get-user';
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

  const charactersSlot = (
    <StageCharacters
      projectId={project.id}
      script={project.script as PersistedScript | null}
      tier={project.tier as Tier}
      expandedCharacterId={expandedCharacterId}
      modalTab={modalTab}
    />
  );

  return (
    <Workspace
      project={project}
      initialChatMessages={messagesResult.data ?? []}
      charactersSlot={charactersSlot}
    />
  );
}
