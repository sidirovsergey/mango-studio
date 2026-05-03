'use client';

import { Chat } from '@/components/chat/Chat';
import type { PersistedScript, Tier } from '@mango/core';
import type { Database } from '@mango/db/types';
import { TopBar } from './TopBar';
import { WorkspaceScroll } from './WorkspaceScroll';
import { StageFinal } from './stages/StageFinal';
import { StageIdea } from './stages/StageIdea';
import { StageScenes } from './stages/StageScenes';
import { StageScript } from './stages/StageScript';

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

interface WorkspaceProps {
  project: ProjectRow;
  initialChatMessages: ChatMessageRow[];
  charactersSlot: React.ReactNode;
}

export function Workspace({ project, initialChatMessages, charactersSlot }: WorkspaceProps) {
  const script = project.script as PersistedScript | null;
  const status = project.status;
  const hasReadyCharacter = (script?.characters ?? []).some((c) => c.dossier !== null);

  return (
    <div
      className="app"
      data-phase="workspace"
      style={{ opacity: 1, visibility: 'visible' as const }}
    >
      <Chat projectId={project.id} initialMessages={initialChatMessages} />
      <main className="workspace-shell">
        <TopBar
          projectId={project.id}
          autoMode={project.auto_mode}
          format={project.format as '9:16' | '16:9' | '1:1'}
          tier={project.tier as Tier}
        />
        <WorkspaceScroll>
          <div className="workspace">
            <StageIdea project={project} />
            {charactersSlot}
            <StageScript project={project} script={script} />
            <StageScenes
              projectId={project.id}
              projectStatus={status}
              hasReadyCharacter={hasReadyCharacter}
            />
            <StageFinal projectStatus={status} />
          </div>
        </WorkspaceScroll>
      </main>
    </div>
  );
}
