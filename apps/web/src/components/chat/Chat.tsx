'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { useState } from 'react';

interface ChatMsg {
  id: number;
  role: 'user' | 'ai';
  label: string;
  content: ReactNode;
}

const SEED_MESSAGES: ChatMsg[] = [
  {
    id: 1,
    role: 'user',
    label: 'Ты',
    content:
      'Хочу мультик, 40 секунд, про дельфина, который ищет работу и проходит собеседования с курьёзными ситуациями.',
  },
  {
    id: 2,
    role: 'ai',
    label: 'Mango AI',
    content: (
      <>
        Поняла! Записала: <b>40 секунд, 9:16, стиль 3D Pixar</b>. Главный герой — оптимистичный
        дельфин Дэнни. Сейчас сгенерирую персонажей и сценарий — посмотришь справа в карточках, всё
        можно поправить ✨
      </>
    ),
  },
  {
    id: 3,
    role: 'user',
    label: 'Ты',
    content: 'Дельфину можно очки добавить?',
  },
  {
    id: 4,
    role: 'ai',
    label: 'Mango AI',
    content: (
      <>
        Перегенерирую с очками — модно-деловыми, в роговой оправе.{' '}
        <span className="typing-dots">
          <i />
          <i />
          <i />
        </span>
      </>
    ),
  },
];

function AiOrb() {
  return <div className="ai-orb" />;
}

function ChatHeader() {
  return (
    <div className="chat-header">
      <AiOrb />
      <div className="chat-title">
        Mango AI
        <span className="sub">Помогает собрать твой мультик</span>
      </div>
    </div>
  );
}

interface ChatStreamProps {
  messages: ChatMsg[];
}

function ChatStream({ messages }: ChatStreamProps) {
  return (
    <div className="chat-stream">
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.role}`}>
          <span className="label">{m.label}</span>
          {m.content}
        </div>
      ))}
    </div>
  );
}

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}

function ChatInput({ value, onChange, onSend }: ChatInputProps) {
  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSend();
    }
  };
  return (
    <div className="chat-input-wrap">
      <div className="chat-input">
        <input
          placeholder="Уточни что-нибудь… например, «сделай дельфина грустнее»"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
        />
        <button type="button" className="send-btn" title="Отправить" onClick={onSend}>
          <svg
            className="i"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Отправить"
          >
            <title>Отправить</title>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    const text = draft.trim();
    if (text.length === 0) return;
    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role: 'user', label: 'Ты', content: text },
    ]);
    setDraft('');
    // Real LLM call lands in Phase 1.1 via chatAction; for now this is local-only echo state.
  };

  return (
    <aside className="chat">
      <ChatHeader />
      <ChatStream messages={messages} />
      <ChatInput value={draft} onChange={setDraft} onSend={handleSend} />
    </aside>
  );
}
