'use client';

import { WorkspaceScroll } from './WorkspaceScroll';
import { TopBar } from './TopBar';
import { StageIdea } from './stages/StageIdea';
import { StageCharacters } from './stages/StageCharacters';
import { StageScript } from './stages/StageScript';
import { StageScenes } from './stages/StageScenes';
import { StageFinal } from './stages/StageFinal';
import { Chat } from '@/components/chat/Chat';
import type { Database } from '@mango/db/types';
import type { ScriptGenOutput } from '@mango/core';

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
