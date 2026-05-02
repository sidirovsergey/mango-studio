// Phase 1.2.6 — surfaced tool calls & pending actions for chat UI
// These types live in the core layer (no Supabase deps) and are reused by
// web server actions + UI components.

export type ToolChipKind =
  // Phase 1.1.L (script/scene/meta)
  | 'refine_script'
  | 'regen_script'
  | 'add_scene'
  | 'delete_scene'
  | 'refine_beat'
  | 'update_project_meta'
  // Phase 1.2.5 character tools
  | 'add_character'
  | 'unarchive_character'
  | 'refine_character'
  | 'generate_character'
  // Phase 1.2.6 new
  | 'archive_character'
  | 'delete_character';

export type SyncHintStatus = 'visible' | 'triggered' | 'dismissed';

export interface SyncHint {
  reason: string;
  suggested_instruction: string;
  status: SyncHintStatus;
}

export type RegenHintStatus = 'visible' | 'triggered' | 'dismissed';

export interface RegenHint {
  /** character_id для перегенерации досье */
  character_id: string;
  /** имя персонажа для UI */
  character_name: string;
  status: RegenHintStatus;
}

export interface ToolChip {
  kind: ToolChipKind;
  label: string;
  ok: boolean;
  error?: string;
  sync_hint?: SyncHint;
  /** Phase 1.2.6 fix-3 — после refine_character confirmed предлагаем
   * перерисовать досье (т.к. описание изменилось, картинка устарела).
   * Триггерит generate_character_regen pending-action. */
  regen_hint?: RegenHint;
}

export type PendingActionKind =
  | 'refine_character'
  | 'generate_character_regen'
  | 'delete_character';

export type PendingActionStatus = 'pending' | 'executed' | 'cancelled';

export interface PendingActionPreview {
  title: string;
  subject: string;
  summary: string;
  warning?: string;
}

export interface PendingAction {
  id: string;
  kind: PendingActionKind;
  payload: Record<string, unknown>;
  preview: PendingActionPreview;
  status: PendingActionStatus;
  resolved_at?: string;
}
