'use client';

import { updateIdeaAction, updateProjectMetaAction } from '@/server/actions/projects';
import type { Database } from '@mango/db/types';
import { useState, useTransition } from 'react';
import { StageHead } from '../shared/StageHead';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

interface Props {
  project: ProjectRow;
}

const DURATION_OPTIONS = [15, 20, 30, 40, 60, 90];
const FORMAT_OPTIONS: { val: '9:16' | '16:9' | '1:1'; label: string }[] = [
  { val: '9:16', label: '9:16 · Вертикаль' },
  { val: '16:9', label: '16:9 · Горизонталь' },
  { val: '1:1', label: '1:1 · Квадрат' },
];
const STYLE_OPTIONS: { val: '3d_pixar' | '2d_drawn' | 'clay_art'; label: string }[] = [
  { val: '3d_pixar', label: '3D Pixar' },
  { val: '2d_drawn', label: '2D рисованный' },
  { val: 'clay_art', label: 'Клей-арт' },
];

const FORMAT_LABEL: Record<string, string> = {
  '9:16': 'Вертикаль',
  '16:9': 'Горизонталь',
  '1:1': 'Квадрат',
};
const STYLE_LABEL: Record<string, string> = {
  '3d_pixar': '3D Pixar',
  '2d_drawn': '2D рисованный',
  clay_art: 'Клей-арт',
};

export function StageIdea({ project }: Props) {
  const [editingField, setEditingField] = useState<'duration' | 'format' | 'style' | null>(null);
  const [isEditingIdea, setIsEditingIdea] = useState(false);
  const [draftIdea, setDraftIdea] = useState(project.idea ?? '');
  const [isPending, startTransition] = useTransition();

  const toggleField = (field: 'duration' | 'format' | 'style') =>
    setEditingField((prev) => (prev === field ? null : field));

  const handleMeta = (fields: {
    target_duration_sec?: number;
    format?: '9:16' | '16:9' | '1:1';
    style?: '3d_pixar' | '2d_drawn' | 'clay_art';
  }) => {
    setEditingField(null);
    startTransition(() => updateProjectMetaAction({ project_id: project.id, ...fields }));
  };

  const handleSaveIdea = () => {
    const trimmed = draftIdea.trim();
    if (!trimmed) return;
    setIsEditingIdea(false);
    startTransition(() => updateIdeaAction({ project_id: project.id, idea: trimmed }));
  };

  const handleCancelIdea = () => {
    setIsEditingIdea(false);
    setDraftIdea(project.idea ?? '');
  };

  return (
    <section className="stage" data-stage id="ideaStage">
      <StageHead num="01" title="Идея">
        {/* suppressHydrationWarning: toLocaleString differs server(UTC) vs client(user TZ) */}
        <span className="stage-subtitle" suppressHydrationWarning>
          {`Обновлено ${new Date(project.updated_at).toLocaleString('ru-RU')}`}
        </span>
      </StageHead>

      <div className="idea-summary">
        {/* Duration */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="meta-tile"
            onClick={() => toggleField('duration')}
            disabled={isPending}
          >
            <div className="key">Длительность</div>
            <div className="val">
              <em>{project.target_duration_sec}</em> секунд
            </div>
          </button>
          {editingField === 'duration' && (
            <div className="meta-popover">
              {DURATION_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`popover-opt${project.target_duration_sec === sec ? ' active' : ''}`}
                  onClick={() => handleMeta({ target_duration_sec: sec })}
                >
                  {sec} сек
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Format */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="meta-tile"
            onClick={() => toggleField('format')}
            disabled={isPending}
          >
            <div className="key">Формат</div>
            <div className="val">
              {project.format} · {FORMAT_LABEL[project.format ?? '9:16'] ?? project.format}
            </div>
          </button>
          {editingField === 'format' && (
            <div className="meta-popover">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className={`popover-opt${project.format === opt.val ? ' active' : ''}`}
                  onClick={() => handleMeta({ format: opt.val })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Style */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="meta-tile"
            onClick={() => toggleField('style')}
            disabled={isPending}
          >
            <div className="key">Стиль</div>
            <div className="val">{STYLE_LABEL[project.style ?? '3d_pixar'] ?? project.style}</div>
          </button>
          {editingField === 'style' && (
            <div className="meta-popover">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className={`popover-opt${project.style === opt.val ? ' active' : ''}`}
                  onClick={() => handleMeta({ style: opt.val })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Idea text — textarea-swap pattern (no contentEditable) */}
      {isEditingIdea ? (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            className="idea-edit-textarea"
            value={draftIdea}
            onChange={(e) => setDraftIdea(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={isPending}
            // biome-ignore lint/a11y/noAutofocus: textarea opens on explicit user action; autofocus is desired UX
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="cta"
              style={{ fontSize: 13, padding: '8px 16px' }}
              onClick={handleSaveIdea}
              disabled={isPending || !draftIdea.trim()}
            >
              Сохранить
            </button>
            <button type="button" className="cancel-btn" onClick={handleCancelIdea}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="idea-text-row">
          <p className="idea-text">{project.idea}</p>
          <button
            type="button"
            className="icon-btn"
            title="Редактировать идею"
            onClick={() => {
              setDraftIdea(project.idea ?? '');
              setIsEditingIdea(true);
            }}
          >
            <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20l4-4M3 21l3-9 9-9 6 6-9 9-9 3z" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
