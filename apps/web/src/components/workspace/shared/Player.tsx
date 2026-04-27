interface PlayerProps {
  silhouette?: string;
  /** 0-1 fraction of progress to show. Default 0.38 — matches demo. */
  progress?: number;
}

export function Player({ silhouette = '🐬', progress = 0.38 }: PlayerProps) {
  const progressPct = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  return (
    <div className="player">
      <div className="frame">
        <div className="silhouette">{silhouette}</div>
      </div>
      <div className="play-big">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          style={{ fill: 'currentColor' }}
          role="img"
          aria-label="Воспроизвести"
        >
          <title>Воспроизвести</title>
          <path d="M7 5v14l12-7z" />
        </svg>
      </div>
      <div className="progress">
        <i style={{ width: progressPct }} />
      </div>
    </div>
  );
}
