import type { PendingAction, ToolChip } from '@mango/core';
import type { Database } from '@mango/db/types';
import { PendingActionCard } from './PendingActionCard';
import { ToolChipView } from './ToolChipView';

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

/**
 * Phase 1.2.6 layout: каждый assistant bubble = chips сверху → text → pending card снизу.
 * `chip-only` сообщения (content === '') — без text-блока.
 */
export function ChatStream({ messages, pending }: Props) {
  return (
    <div className="chat-stream">
      {messages.map((m) => {
        if (m.role === 'system') return null;
        const chips = (m.tool_chips ?? null) as ToolChip[] | null;
        const pendingAction = (m.pending_action ?? null) as PendingAction | null;
        const showText = m.content && m.content.trim().length > 0;
        return (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
            <span className="label">{ROLE_LABEL[m.role as ChatRole]}</span>
            {chips && chips.length > 0 && (
              <div className="msg-chips">
                {chips.map((chip, idx) => (
                  <ToolChipView
                    key={`${m.id}-chip-${idx}`}
                    chip={chip}
                    chatMessageId={m.id}
                    chipIndex={idx}
                  />
                ))}
              </div>
            )}
            {showText && <div className="msg-text">{m.content}</div>}
            {pendingAction && <PendingActionCard pending={pendingAction} chatMessageId={m.id} />}
          </div>
        );
      })}
      {pending && (
        <div className="msg ai">
          <span className="label">Mango AI</span>
          <span className="typing-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
    </div>
  );
}
