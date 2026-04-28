'use client';

interface Props {
  projectId: string;
  autoMode: boolean;
  format: '9:16' | '16:9' | '1:1';
}

export function TopBar(_props: Props) {
  return <div className="topbar" data-stub="phase-1.1.H" />;
}
