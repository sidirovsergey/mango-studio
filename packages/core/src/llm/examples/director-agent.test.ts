import { describe, expect, it } from 'vitest';
import { DIRECTOR_AGENT_EXAMPLES } from './director-agent';
import type { DirectorAgentExample } from './director-agent';

const KNOWN_TOOL_NAMES = new Set([
  'refine_script',
  'regen_script',
  'refine_beat',
  'add_character',
  'archive_character',
  'unarchive_character',
  'delete_character',
  'set_character_voice',
  'rollback_scene_version',
]);

describe('DIRECTOR_AGENT_EXAMPLES', () => {
  it('exports exactly 8 examples', () => {
    expect(DIRECTOR_AGENT_EXAMPLES).toHaveLength(8);
  });

  it('all labels are unique', () => {
    const labels = DIRECTOR_AGENT_EXAMPLES.map((e) => e.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it('all user_messages are non-empty and contain at least one Cyrillic character', () => {
    for (const ex of DIRECTOR_AGENT_EXAMPLES) {
      expect(ex.user_message.length).toBeGreaterThan(0);
      expect(/[а-яёА-ЯЁ]/.test(ex.user_message)).toBe(true);
    }
  });

  it('all thinking strings are non-empty', () => {
    for (const ex of DIRECTOR_AGENT_EXAMPLES) {
      expect(ex.thinking.length).toBeGreaterThan(0);
    }
  });

  it('all tool names are from the known set', () => {
    for (const ex of DIRECTOR_AGENT_EXAMPLES) {
      for (const tc of ex.tool_calls) {
        expect(KNOWN_TOOL_NAMES.has(tc.name)).toBe(true);
      }
    }
  });

  it('example 0 (archive-not-delete): exactly 1 archive_character call', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[0] as DirectorAgentExample;
    expect(ex.label).toBe('archive-not-delete');
    expect(ex.tool_calls).toHaveLength(1);
    expect(ex.tool_calls[0]?.name).toBe('archive_character');
  });

  it('example 1 (hard-delete-pending): exactly 1 delete_character call', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[1] as DirectorAgentExample;
    expect(ex.label).toBe('hard-delete-pending');
    expect(ex.tool_calls).toHaveLength(1);
    expect(ex.tool_calls[0]?.name).toBe('delete_character');
  });

  it('example 2 (multi-scene-regen-one-pending): exactly 1 tool call', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[2] as DirectorAgentExample;
    expect(ex.label).toBe('multi-scene-regen-one-pending');
    expect(ex.tool_calls).toHaveLength(1);
  });

  it('example 3 (ambiguous-refine-with-rationale): exactly 1 refine_beat call', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[3] as DirectorAgentExample;
    expect(ex.label).toBe('ambiguous-refine-with-rationale');
    expect(ex.tool_calls).toHaveLength(1);
    expect(ex.tool_calls[0]?.name).toBe('refine_beat');
  });

  it('example 4 (conversational-no-tool): exactly 0 tool calls', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[4] as DirectorAgentExample;
    expect(ex.label).toBe('conversational-no-tool');
    expect(ex.tool_calls).toHaveLength(0);
  });

  it('example 5 (unarchive-match): exactly 1 unarchive_character call', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[5] as DirectorAgentExample;
    expect(ex.label).toBe('unarchive-match');
    expect(ex.tool_calls).toHaveLength(1);
    expect(ex.tool_calls[0]?.name).toBe('unarchive_character');
  });

  it('example 6 (unarchive-miss): exactly 0 tool calls', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[6] as DirectorAgentExample;
    expect(ex.label).toBe('unarchive-miss');
    expect(ex.tool_calls).toHaveLength(0);
  });

  it('example 7 (set-voice-audio-guard): exactly 1 set_character_voice call', () => {
    const ex = DIRECTOR_AGENT_EXAMPLES[7] as DirectorAgentExample;
    expect(ex.label).toBe('set-voice-audio-guard');
    expect(ex.tool_calls).toHaveLength(1);
    expect(ex.tool_calls[0]?.name).toBe('set_character_voice');
  });

  it('stable label order snapshot', () => {
    const labels = DIRECTOR_AGENT_EXAMPLES.map((e) => e.label);
    expect(labels).toEqual([
      'archive-not-delete',
      'hard-delete-pending',
      'multi-scene-regen-one-pending',
      'ambiguous-refine-with-rationale',
      'conversational-no-tool',
      'unarchive-match',
      'unarchive-miss',
      'set-voice-audio-guard',
    ]);
  });
});
