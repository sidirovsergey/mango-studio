-- Phase 1.2.6 fix-3 — добавляем UPDATE policy для chat_messages.
-- Без неё confirmPendingActionAction / triggerSyncHintAction молча no-op'ят:
-- RLS блокирует UPDATE, supabase-js не считает 0 rows affected ошибкой.
-- Симптом: pending action остаётся pending после клика «Подтвердить»,
-- хотя refine_character реально отрабатывает; chip status sync_hint'а не
-- меняется на triggered/dismissed.
--
-- Юзер может обновлять любую row своего проекта (через projects ownership).

CREATE POLICY "chat_messages_update_via_project" ON chat_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = chat_messages.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = chat_messages.project_id
        AND p.user_id = (SELECT auth.uid())
    )
  );
