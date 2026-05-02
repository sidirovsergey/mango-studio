import { getCurrentUser } from '@/lib/auth/get-user';
import { type PersistedScript, type Scene, normalizeScene } from '@mango/core';
import type { Database } from '@mango/db';
import { getServerSupabase } from '@mango/db/server';
import { notFound } from 'next/navigation';
import { StoryboardClient } from './StoryboardClient';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];
type SceneWithOverrides = Scene & { config_overrides?: { model?: string } };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StoryboardPage({ params }: Props) {
  const { id } = await params;

  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return notFound();
  }

  const sb = await getServerSupabase();

  const [projectResult, jobsResult] = await Promise.all([
    sb.from('projects').select('id, user_id, script, tier, title').eq('id', id).single(),
    sb
      .from('media_jobs')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (projectResult.error || !projectResult.data) {
    return notFound();
  }

  const project = projectResult.data;

  // Auth check
  if (project.user_id !== user.id) {
    return notFound();
  }

  const rawScript = project.script as PersistedScript | null;

  // Normalize scenes to ensure all fields are present (handles legacy data)
  const normalizedScript = rawScript
    ? {
        ...rawScript,
        scenes: rawScript.scenes.map((s) => {
          const normalized = normalizeScene(s) as SceneWithOverrides;
          // Preserve config_overrides from raw scene if present
          const raw = s as SceneWithOverrides;
          if (raw.config_overrides) {
            normalized.config_overrides = raw.config_overrides;
          }
          return normalized;
        }),
      }
    : null;

  const initialJobs = (jobsResult.data ?? []) as MediaJobRow[];
  const tier = (project.tier ?? 'economy') as 'economy' | 'premium';

  return (
    <StoryboardClient
      projectId={project.id}
      tier={tier}
      initialScript={normalizedScript}
      initialJobs={initialJobs}
    />
  );
}
