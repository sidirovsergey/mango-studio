'use server';

import { getLLMProvider, type ChatMessage } from '@mango/core';

export async function chatAction(messages: ChatMessage[]): Promise<{ reply: string }> {
  const llm = getLLMProvider();
  const result = await llm.chat({ messages });
  return result.output;
}
