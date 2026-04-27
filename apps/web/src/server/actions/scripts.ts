'use server';

import { getLLMProvider, type ScriptGenInput, type ScriptGenOutput } from '@mango/core';

export async function generateScriptAction(input: ScriptGenInput): Promise<ScriptGenOutput> {
  const llm = getLLMProvider();
  const result = await llm.generateScript(input);
  return result.output;
}
