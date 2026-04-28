'use client';

import type { Database } from '@mango/db/types';

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

interface Props {
  projectId: string;
  initialMessages: ChatMessageRow[];
}

export function Chat(_props: Props) {
  return <aside className="chat" data-stub="phase-1.1.J" />;
}
