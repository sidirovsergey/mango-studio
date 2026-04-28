import type { Database } from '@mango/db/types';

type ChatRow = Database['public']['Tables']['chat_messages']['Row'];

interface Props {
  messages: ChatRow[];
  pending: boolean;
}

type ChatRole = 'user' | 'assistant' | 'system';

const ROLE_LABEL: Record<ChatRole, string> = {
  user: 'Ты',
  assistant: 'Mango AI',
  system: 'system',
};

export function ChatStream({ messages, pending }: Props) {
  return (
    <div className="chat-stream">
      {messages.map((m) => {
        if (m.role === 'system') return null;
        return (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
            <span className="label">{ROLE_LABEL[m.role as ChatRole]}</span>
            {m.content}
          </div>
        );
      })}
      {pending && (
        <div className="msg ai">
          <span className="label">Mango AI</span>
          <span className="typing-dots"><i /><i /><i /></span>
        </div>
      )}
    </div>
  );
}
