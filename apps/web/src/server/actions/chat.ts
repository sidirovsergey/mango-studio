'use server';

import { type ChatMessage, getLLMProvider } from '@mango/core';

export async function chatAction(messages: ChatMessage[]): Promise<{ reply: string }> {
  return getLLMProvider().chat({ messages });
}
