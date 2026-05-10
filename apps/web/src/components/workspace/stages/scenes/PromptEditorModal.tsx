'use client';

// STUB — implemented in Sub-phase E (PromptEditorModal full UX)
// Renders nothing for now; the new SceneSidePanel renders this as a pop-out
// when the user clicks "✏️ открыть" on a prompt section.

interface Props {
  projectId: string;
  sceneId: string;
  kind: 'first_frame' | 'video';
  onClose: () => void;
}

export function PromptEditorModal(_: Props) {
  return null;
}
