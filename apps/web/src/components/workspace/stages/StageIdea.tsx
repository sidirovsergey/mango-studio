'use client';

import { updateProjectMetaAction } from '@/server/actions/projects';
import type { Database } from '@mango/db/types';
import { Popover } from '@mango/ui';
import { useRef, useState, useTransition } from 'react';
import { StageHead } from '../shared/StageHead';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

interface Props {
  project: ProjectRow;
}

type EditField = 'duration' | 'format' | 'style';

const DURATION_OPTS = [
  { v: 15, label: '15 секунд', sub: 'Короткий клип' },
  { v: 30, label: '30 секунд', sub: 'TikTok-формат' },
  { v: 40, label: '40 секунд', sub: 'Базовая длина' },
  { v: 60, label: '60 секунд', sub: 'Мини-история' },
  { v: 90, label: '90 секунд', sub: 'Мини-трейлер' },
] as const;

const FORMAT_OPTS = [
  { v: '9:16' as const, label: '9:16 · Вертикаль', sub: 'TikTok / Reels / Shorts' },
  { v: '16:9' as const, label: '16:9 · Горизонталь', sub: 'YouTube / Web' },
  { v: '1:1' as const, label: '1:1 · Квадрат', sub: 'Instagram Feed' },
];

const STYLE_OPTS = [
  { v: '3d_pixar' as const, label: '3D Pixar', sub: 'Кино-стиль, мягкие материалы' },
  { v: '2d_drawn' as const, label: '2D рисованный', sub: 'Гуашь, линии, бумага' },
  { v: 'clay_art' as const, label: 'Клей-арт', sub: 'Пластилин, Wallace & Gromit' },
];

function formatLabel(format: string) {
  return format === '9:16' ? 'Вертикаль' : format === '16:9' ? 'Горизонталь' : 'Квадрат';
}

function styleLabel(style: string) {
  return style === '3d_pixar' ? '3D Pixar' : style === '2d_drawn' ? '2D рисованный' : 'Клей-арт';
}

export function StageIdea({ project }: Props) {
  const [open, setOpen] = useState<EditField | null>(null);
  const [, startTransition] = useTransition();

  const durationRef = useRef<HTMLButtonElement>(null);
  const formatRef = useRef<HTMLButtonElement>(null);
  const styleRef = useRef<HTMLButtonElement>(null);

  const anchorFor = (field: EditField) => {
    if (field === 'duration') return durationRef;
    if (field === 'format') return formatRef;
    return styleRef;
  };

  function toggleOpen(field: EditField) {
    setOpen((prev) => (prev === field ? null : field));
  }

  function applyDuration(sec: number) {
    setOpen(null);
    startTransition(() => {
      updateProjectMetaAction({ project_id: project.id, target_duration_sec: sec });
    });
  }

  function applyFormat(fmt: '9:16' | '16:9' | '1:1') {
    setOpen(null);
    startTransition(() => {
      updateProjectMetaAction({ project_id: project.id, format: fmt });
    });
  }

  function applyStyle(sty: '3d_pixar' | '2d_drawn' | 'clay_art') {
    setOpen(null);
    startTransition(() => {
      updateProjectMetaAction({ project_id: project.id, style: sty });
    });
  }

  function handleIdeaBlur(e: React.FocusEvent<HTMLParagraphElement>) {
    const text = e.currentTarget.textContent?.trim() ?? '';
    if (text && text !== project.idea) {
      startTransition(() => {
        updateProjectMetaAction({ project_id: project.id, idea: text });
      });
    }
  }

  function handleIdeaKeyDown(e: React.KeyboardEvent<HTMLParagraphElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      // restore original
      e.currentTarget.textContent = project.idea ?? '';
      e.currentTarget.blur();
    }
  }

  return (
    <section className="stage" data-stage id="ideaStage">
      <StageHead num="01" title="Идея">
        <span className="stage-subtitle">{`Обновлено ${new Date(project.updated_at).toLocaleString('ru-RU')}`}</span>
      </StageHead>

      <div className="idea-summary">
        {/* Duration */}
        <button
          ref={durationRef}
          type="button"
          className="meta-tile"
          data-edit="duration"
          onClick={() => toggleOpen('duration')}
        >
          <div className="key">Длительность</div>
          <div className="val" data-val>
            <em>{project.target_duration_sec}</em> секунд
          </div>
        </button>

        {/* Format */}
        <button
          ref={formatRef}
          type="button"
          className="meta-tile"
          data-edit="format"
          onClick={() => toggleOpen('format')}
        >
          <div className="key">Формат</div>
          <div className="val" data-val>
            {project.format} · {formatLabel(project.format ?? '9:16')}
          </div>
        </button>

        {/* Style */}
        <button
          ref={styleRef}
          type="button"
          className="meta-tile"
          data-edit="style"
          onClick={() => toggleOpen('style')}
        >
          <div className="key">Стиль</div>
          <div className="val" data-val>
            {styleLabel(project.style ?? '3d_pixar')}
          </div>
        </button>
      </div>

      {/* Duration popover */}
      <Popover open={open === 'duration'} onClose={() => setOpen(null)} anchor={anchorFor('duration')} placement="bottom">
        <div className="pop-title">Длительность</div>
        {DURATION_OPTS.map((opt) => (
          <button
            key={opt.v}
            type="button"
            className={`pop-opt${project.target_duration_sec === opt.v ? ' active' : ''}`}
            onClick={() => applyDuration(opt.v)}
          >
            <span className="dot" />
            <span className="t">
              {opt.label}
              <span className="sub">{opt.sub}</span>
            </span>
            <svg className="i check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12l5 5 9-11" />
            </svg>
          </button>
        ))}
      </Popover>

      {/* Format popover */}
      <Popover open={open === 'format'} onClose={() => setOpen(null)} anchor={anchorFor('format')} placement="bottom">
        <div className="pop-title">Формат</div>
        {FORMAT_OPTS.map((opt) => (
          <button
            key={opt.v}
            type="button"
            className={`pop-opt${project.format === opt.v ? ' active' : ''}`}
            onClick={() => applyFormat(opt.v)}
          >
            <span className="dot" />
            <span className="t">
              {opt.label}
              <span className="sub">{opt.sub}</span>
            </span>
            <svg className="i check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12l5 5 9-11" />
            </svg>
          </button>
        ))}
      </Popover>

      {/* Style popover */}
      <Popover open={open === 'style'} onClose={() => setOpen(null)} anchor={anchorFor('style')} placement="bottom">
        <div className="pop-title">Стиль</div>
        {STYLE_OPTS.map((opt) => (
          <button
            key={opt.v}
            type="button"
            className={`pop-opt${project.style === opt.v ? ' active' : ''}`}
            onClick={() => applyStyle(opt.v)}
          >
            <span className="dot" />
            <span className="t">
              {opt.label}
              <span className="sub">{opt.sub}</span>
            </span>
            <svg className="i check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12l5 5 9-11" />
            </svg>
          </button>
        ))}
      </Popover>

      {/* Idea text — inline editable */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <p
        className="stage-idea-text"
        contentEditable
        suppressContentEditableWarning
        onBlur={handleIdeaBlur}
        onKeyDown={handleIdeaKeyDown}
        style={{ marginTop: 16, color: 'var(--ink-500)' }}
      >
        {project.idea}
      </p>
    </section>
  );
}
