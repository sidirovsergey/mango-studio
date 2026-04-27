'use server';

import { type ScriptGenInput, type ScriptGenOutput, getLLMProvider } from '@mango/core';

export async function generateScriptAction(input: ScriptGenInput): Promise<ScriptGenOutput> {
  return getLLMProvider().generateScript(input);
}
