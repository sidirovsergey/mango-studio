import { Workspace } from '@/components/workspace/Workspace';
import { getCurrentUserId } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
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

  return <Workspace project={projectResult.data} initialChatMessages={messagesResult.data ?? []} />;
}
