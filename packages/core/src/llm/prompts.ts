import 'server-only';
import type { ChatMessage, RefineSceneInput, ScriptGenInput } from './provider';

const FORMAT_LABEL: Record<ScriptGenInput['format'], string> = {
  '9:16': 'вертикальное (TikTok/Reels/Shorts)',
  '16:9': 'горизонтальное (YouTube)',
  '1:1': 'квадратное (Instagram feed)',
};

const STYLE_LABEL: Record<ScriptGenInput['style'], string> = {
  '3d_pixar': '3D Pixar — объёмный, тёплая палитра, выразительные персонажи',
  '2d_drawn': '2D рисованный — мягкие текстуры карандаша/гуаши, ламповая атмосфера',
  clay_art: 'Клей-арт — пластилиновая анимация, фактурные поверхности, лёгкая «несовершенность»',
};

export const SCRIPT_SYSTEM_PROMPT = `Ты — Mango, AI-режиссёр коротких мультиков.
Твоя задача — превратить идею пользователя в готовый сценарий из 2-8 сцен.

Главные принципы:
- Каждая сцена — единый план действия, описанный достаточно подробно для генерации видео.
- Длительности сцен в сумме должны примерно равняться target_duration_sec (±15%).
- Закадровый текст (voiceover) — не у каждой сцены, только где он работает на драматургию.
- Заголовок — короткий, цепляющий, без штампов.
- Персонажи — 1-3 главных, описанных одной строкой каждый.
- Пиши по-русски, естественным современным языком.`;

export function buildScriptUserPrompt(input: ScriptGenInput): string {
  return `Идея пользователя: «${input.user_prompt}»

Параметры:
- Длительность: ${input.duration_sec} секунд
- Формат кадра: ${FORMAT_LABEL[input.format]}
- Визуальный стиль: ${STYLE_LABEL[input.style]}

Сгенерируй сценарий по этой идее, соблюдая параметры. Верни JSON по схеме.`;
}

export const REFINE_SYSTEM_PROMPT = `Ты — Mango, AI-режиссёр.
Тебе дано описание одной сцены и инструкция от пользователя как её улучшить.
Верни ОДНО предложение — обновлённое описание сцены, в том же стиле и тоне.
Только новое описание, без префиксов вроде "Вот улучшенная версия:".`;

export function buildRefineUserPrompt(input: RefineSceneInput): string {
  return `Текущее описание сцены: «${input.current}»

Инструкция: ${input.instruction}

Дай обновлённое описание сцены.`;
}

export const CHAT_SYSTEM_PROMPT = `Ты — Mango, AI-режиссёр коротких мультиков.
Помогаешь пользователю придумать и собрать мультик.
Отвечай тепло, кратко, по делу. Можешь предлагать идеи, уточнять детали, обсуждать сценарий.
Не вставляй лишние markdown-заголовки. Пиши как живой собеседник.
Если пользователь просит что-то сгенерировать (персонажа, сцену, видео) — скажи "сейчас сделаю" и подскажи какую кнопку в интерфейсе нажать (например, «нажми Создать сценарий на Stage 03»).`;

export function chatMessagesWithSystem(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length > 0 && messages[0]!.role === 'system') return messages;
  return [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...messages];
}
