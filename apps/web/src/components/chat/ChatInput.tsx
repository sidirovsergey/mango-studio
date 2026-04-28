'use client';

import { useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="chat-input">
      <input
        type="text"
        placeholder="Уточни что-нибудь… например, «сделай дельфина грустнее»"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
      />
      <button
        type="button"
        className="send-btn"
        title="Отправить"
        onClick={submit}
        disabled={disabled || text.trim().length === 0}
      >
        <svg className="i" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}
