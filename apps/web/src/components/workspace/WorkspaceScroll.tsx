import type { ReactNode } from 'react';

export function WorkspaceScroll({ children }: { children: ReactNode }) {
  return <div className="workspace-scroll">{children}</div>;
}
