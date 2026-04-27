'use client';

import type { LandingFormat, LandingStyle } from '../landing/Landing';
import { WorkspaceScroll } from './WorkspaceScroll';
import { StageCharacters } from './stages/StageCharacters';
import { StageFinal } from './stages/StageFinal';
import { StageIdea } from './stages/StageIdea';
import { StageScenes } from './stages/StageScenes';
import { StageScript } from './stages/StageScript';

interface WorkspaceProps {
  initialIdea: string;
  initialFormat: LandingFormat;
  initialStyle: LandingStyle;
  onBackToLanding?: () => void;
}

export function Workspace({
  initialIdea,
  initialFormat,
  initialStyle,
  onBackToLanding,
}: WorkspaceProps) {
  return (
    <main className="workspace-shell">
      <div className="topbar">
        <div className="brand">
          {onBackToLanding && (
            <button
              type="button"
              className="back-pill"
              id="backToLanding"
              title="К landing"
              onClick={onBackToLanding}
            >
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
                aria-label="Назад"
              >
                <title>Назад</title>
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              Назад
            </button>
          )}
          <span className="brand-mark" />
          <span className="brand-name">
            Mango<span>Studio</span>
          </span>
        </div>
        <div className="topbar-right">
          <div className="seg" role="tablist" aria-label="Aspect">
            <button type="button" className="active" data-aspect="9/16">
              9:16
            </button>
            <button type="button" data-aspect="16/9">
              16:9
            </button>
            <button type="button" data-aspect="1/1">
              1:1
            </button>
          </div>
          <div className="tier-indicator" data-tier="economy" title="Текущий режим генерации">
            Режим: Эконом
          </div>
          <div className="credits">
            <span className="dot" />
            ~12 480 кр
          </div>
          <button type="button" className="cta" id="publishBtn">
            <svg
              className="i"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Опубликовать"
            >
              <title>Опубликовать</title>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            Опубликовать
          </button>
        </div>
      </div>

      <WorkspaceScroll>
        <div className="workspace">
          <StageIdea idea={initialIdea} format={initialFormat} style={initialStyle} />
          <StageCharacters />
          <StageScript />
          <StageScenes />
          <StageFinal />
        </div>
      </WorkspaceScroll>
    </main>
  );
}
