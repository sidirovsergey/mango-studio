'use client';

interface Props {
  onClick: () => void;
  badge?: number;
}

export function ChatFab({ onClick, badge }: Props) {
  return (
    <button type="button" className="chat-fab" id="chatFab" title="Открыть чат" onClick={onClick}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="Открыть чат"
      >
        <title>Открыть чат</title>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
      {badge !== undefined && badge > 0 && <span className="badge">{badge}</span>}
    </button>
  );
}
