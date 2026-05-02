'use client';

import { sendChatMessageAction } from '@/server/actions/chat';
import type { LLMProviderError } from '@mango/core';
import type { Database } from '@mango/db/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ChatInput } from './ChatInput';
import { ChatStream } from './ChatStream';

type ChatRow = Database['public']['Tables']['chat_messages']['Row'];

interface Props {
  projectId: string;
  initialMessages: ChatRow[];
}

const ERROR_MESSAGES: Record<string, string> = {
  rate_limit: 'Mango перегрузилась. Попробуй через минутку.',
  safety_filter: 'Сработал safety-фильтр. Попробуй переформулировать.',
  timeout: 'Mango не успела ответить. Попробуй ещё раз.',
  unknown: 'Что-то пошло не так. Попробуй ещё раз.',
};

export function Chat({ projectId, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatRow[]>(initialMessages);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Phase 1.2.6 fix: после router.refresh() initialMessages обновляется (server-side
  // SSR пересчитан), но useState не реагирует на смену props автоматом. Без этого sync
  // юзер видит optimistic state со старыми null-чипами вместо реальных tool_chips/
  // pending_action из БД. Заменяем messages свежим SSR snapshot'ом каждый раз.
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const handleSend = (text: string) => {
    setError(null);
    const optimisticUser: ChatRow = {
      id: `optimistic-${Date.now()}`,
      project_id: projectId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      tool_chips: null,
      pending_action: null,
    };
    // Optimistic user — instant feedback. Реальная user-row придёт через router.refresh()
    // (chat.ts инсёртит её первой) и заменит optimistic через useEffect выше.
    setMessages((prev) => [...prev, optimisticUser]);

    startTransition(async () => {
      try {
        await sendChatMessageAction({ project_id: projectId, content: text });
        // Никаких optimistic assistant — он бы переписал реальный ассистент-row с chips/
        // pending_action на пустую заглушку (баг до 1.2.6-fix-2). Refresh принесёт реальные
        // данные из БД через SSR + useEffect sync.
        router.refresh();
      } catch (err) {
        const code = (err as LLMProviderError)?.code ?? 'unknown';
        setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown!);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      }
    });
  };

  return (
    <aside className="chat">
      <div className="chat-header">
        <div className="ai-orb" />
        <div className="chat-title">
          Mango AI
          <span className="sub">Помогает собрать твой мультик</span>
        </div>
      </div>
      <ChatStream messages={messages} pending={isPending} />
      {error && (
        <div
          className="chat-error"
          role="alert"
          style={{ padding: '8px 16px', color: 'var(--err-500, #c0392b)' }}
        >
          {error}
        </div>
      )}
      <div className="chat-input-wrap">
        <ChatInput onSend={handleSend} disabled={isPending} />
      </div>
    </aside>
  );
}
