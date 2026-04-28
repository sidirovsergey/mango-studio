'use client';

import { Chat } from '@/components/chat/Chat';
import type { ScriptGenOutput } from '@mango/core';
import type { Database } from '@mango/db/types';
import { TopBar } from './TopBar';
import { WorkspaceScroll } from './WorkspaceScroll';
import { StageCharacters } from './stages/StageCharacters';
import { StageFinal } from './stages/StageFinal';
import { StageIdea } from './stages/StageIdea';
import { StageScenes } from './stages/StageScenes';
import { StageScript } from './stages/StageScript';

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

interface WorkspaceProps {
  project: ProjectRow;
  initialChatMessages: ChatMessageRow[];
}

export function Workspace({ project, initialChatMessages }: WorkspaceProps) {
  const script = project.script as ScriptGenOutput | null;
  const status = project.status;

  return (
    <main className="workspace-shell">
      <TopBar
        projectId={project.id}
        autoMode={project.auto_mode}
        format={project.format as '9:16' | '16:9' | '1:1'}
      />
      <WorkspaceScroll>
        <div className="workspace">
          <StageIdea project={project} />
          <StageCharacters projectStatus={status} />
          <StageScript project={project} script={script} />
          <StageScenes projectStatus={status} />
          <StageFinal projectStatus={status} />
        </div>
      </WorkspaceScroll>
      <Chat projectId={project.id} initialMessages={initialChatMessages} />
    </main>
  );
}
