'use client';

import { InsufficientBalanceProvider } from '@/components/account/InsufficientBalanceProvider';
import { TierGateProvider } from '@/components/account/TierGateProvider';
import { Chat } from '@/components/chat/Chat';
import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import type { PersistedScript, Tier } from '@mango/core';
import type { Database } from '@mango/db/types';
import { ScriptStateProvider, type Stage04Script } from './ScriptStateProvider';
import { TelemetryHeader } from './TelemetryHeader';
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
  initialJobs: MediaJobUiRow[];
  charactersSlot: React.ReactNode;
  userEmail: string | null;
  isAnonymous: boolean;
}

export function Workspace({
  project,
  initialChatMessages,
  initialJobs,
  charactersSlot,
  userEmail,
  isAnonymous,
}: WorkspaceProps) {
  const script = project.script as PersistedScript | null;
  const status = project.status;
  const hasReadyCharacter = (script?.characters ?? []).some((c) => c.dossier !== null);

  return (
    <TierGateProvider>
      <InsufficientBalanceProvider>
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
              userEmail={userEmail}
              isAnonymous={isAnonymous}
            />
            <ScriptStateProvider
              projectId={project.id}
              initialScript={(script as unknown as Stage04Script) ?? null}
              initialJobs={initialJobs}
            >
              <TelemetryHeader />
              <WorkspaceScroll>
                <div className="workspace">
                  <StageIdea project={project} />
                  {charactersSlot}
                  <StageScript project={project} script={script} />
                  <StageScenes
                    projectId={project.id}
                    projectStatus={status}
                    hasReadyCharacter={hasReadyCharacter}
                    tier={project.tier as Tier}
                  />
                  <StageFinal projectStatus={status} projectId={project.id} />
                </div>
              </WorkspaceScroll>
            </ScriptStateProvider>
          </main>
        </div>
      </InsufficientBalanceProvider>
    </TierGateProvider>
  );
}
