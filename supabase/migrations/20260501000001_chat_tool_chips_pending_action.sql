-- Phase 1.2.6 — surface tool calls + pending actions
-- Adds tool_chips and pending_action columns to chat_messages.
-- Both nullable, additive only. Existing RLS policies on chat_messages
-- (user-isolated through projects) cover new columns automatically.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS tool_chips jsonb,
  ADD COLUMN IF NOT EXISTS pending_action jsonb;

COMMENT ON COLUMN chat_messages.tool_chips IS
  'Array of ToolChip records — surfaced tool execution evidence (Phase 1.2.6).';
COMMENT ON COLUMN chat_messages.pending_action IS
  'PendingAction record — confirm/cancel lifecycle for destructive mutations (Phase 1.2.6).';
