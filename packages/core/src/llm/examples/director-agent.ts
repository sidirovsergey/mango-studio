/**
 * Few-shot examples for buildDirectorSystemPrompt — embedded as <example> blocks.
 * Each entry captures the model's inner reasoning (thinking) and the resulting
 * tool call(s) + user-facing reply for a canonical ambiguous input.
 *
 * Covers audit finding F17: weak tool routing for archive-vs-delete, multi-action
 * pendings, and conversational vs action discrimination.
 *
 * T3 will embed these in the Director system prompt's <examples> block.
 */

export interface DirectorAgentExample {
  /** Short kebab-case identifier for the example. */
  label: string;
  /** What the user typed (Russian). */
  user_message: string;
  /**
   * Inner reasoning the model should produce before emitting tool calls.
   * 2–4 sentences referencing state inspection and routing logic.
   */
  thinking: string;
  /** Zero or more tool calls with correct names and arg shapes from director-tools.ts. */
  tool_calls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  /** Brief Russian user-facing message confirming what was done or why no action. */
  reply: string;
}

export const DIRECTOR_AGENT_EXAMPLES: ReadonlyArray<DirectorAgentExample> = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. archive-not-delete
  // "удали Кота" without "навсегда" → archive (recoverable), not hard delete
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'archive-not-delete',
    user_message: 'удали Кота',
    thinking:
      'Пользователь говорит "удали" без уточнения "навсегда" или "окончательно". ' +
      'Политика по умолчанию: мягкое удаление через archive_character — это обратимо. ' +
      'Проверяю <characters_active>: есть персонаж "Кот" с id "c1". ' +
      'Вызываю archive_character; если пользователь хочет именно навсегда — он скажет.',
    tool_calls: [{ name: 'archive_character', args: { character_id: 'c1' } }],
    reply: 'Кот перемещён в архив. Если нужно удалить навсегда — напиши «удали Кота навсегда».',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. hard-delete-pending
  // "удали Кота навсегда" → delete_character (returns pending, UI shows confirm card)
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'hard-delete-pending',
    user_message: 'удали Кота навсегда',
    thinking:
      'Явное слово "навсегда" однозначно означает необратимое удаление — вызываю delete_character. ' +
      'delete_character — деструктивное действие: инструмент сам вернёт pending-action, ' +
      'UI покажет карточку подтверждения. Я не спрашиваю повторно в чате — просто вызываю tool. ' +
      'Персонаж "Кот" найден в <characters_active> с id "c1".',
    tool_calls: [{ name: 'delete_character', args: { character_id: 'c1' } }],
    reply:
      'Действие требует подтверждения: удалить Кота навсегда. Это нельзя отменить. Подтверди в карточке ниже.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. multi-scene-regen-one-pending
  // "перегенерь сцены 2, 3, 4" → ONE refine_script call (regen_script has no
  // scene_ids param; refine_script with explicit instruction covers multi-scene intent).
  // Note: regen_script takes z.object({}) — no scene selection. refine_beat is
  // single-scene only. The closest tool for "regenerate multiple specific scenes"
  // is refine_script with a targeted instruction, keeping one pending per turn.
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'multi-scene-regen-one-pending',
    user_message: 'перегенерь сцены 2, 3, 4',
    thinking:
      'Пользователь хочет обновить несколько сцен сразу. ' +
      'refine_beat принимает один scene_id — нельзя вызвать сразу три. ' +
      'regen_script пересоздаёт весь сценарий с нуля, что избыточно. ' +
      'Правило "один pending за ход": вызываю refine_script с инструкцией пересмотреть сцены 2, 3 и 4, ' +
      'и сообщаю пользователю, что все три будут переработаны в рамках одного прохода.',
    tool_calls: [
      {
        name: 'refine_script',
        args: {
          instruction:
            'Переработай сцены 2, 3 и 4: усиль визуальную динамику, пересмотри action beats каждой.',
        },
      },
    ],
    reply: 'Переписываю сцены 2, 3 и 4 за один проход. Остальные сцены не тронуты.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. ambiguous-refine-with-rationale
  // "сцена 3 пустая, переделай" → refine_beat with editorial rationale, not regen
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'ambiguous-refine-with-rationale',
    user_message: 'сцена 3 пустая, переделай',
    thinking:
      'Пользователь характеризует сцену как "пустую" — это редакторская жалоба на слабый контент, ' +
      'а не запрос на полный пересчёт. refine_beat — правильный инструмент: ' +
      'он обновляет описание одной сцены через LLM-pass, сохраняя остальные сцены нетронутыми. ' +
      'Передаю жалобу пользователя как instruction, чтобы модель понимала контекст.',
    tool_calls: [
      {
        name: 'refine_beat',
        args: {
          scene_id: 's3',
          instruction:
            'Пользователь говорит, что сцена ощущается пустой — добавь визуальную динамику, уточни action beats, усиль эмоциональный пик.',
        },
      },
    ],
    reply:
      'Уточняю сцену 3: добавлю визуальной динамики и усилю эмоциональный пик. Готово через пару секунд.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. conversational-no-tool
  // "у меня нет идей" → conversational reply, no tool call
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'conversational-no-tool',
    user_message: 'у меня нет идей',
    thinking:
      'Это разговорный ввод без конкретного задания — пользователь ищет вдохновение. ' +
      'Никакого инструмента вызывать не нужно: просто предложу несколько направлений для мультика.',
    tool_calls: [],
    reply:
      'Можем оттолкнуться от одной из трёх идей:\n' +
      '1) Повседневный сюжет с неожиданным поворотом — например, кот готовится к важному делу, но всё идёт не так.\n' +
      '2) Маленькое приключение — герой теряет что-то важное и ищет по всему дому.\n' +
      '3) Тихая зарисовка с атмосферой — утренний ритуал, прогулка, первый снег.\n' +
      'Какое направление ближе?',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. unarchive-match
  // "верни Кота" + Кот есть в архиве → unarchive_character
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'unarchive-match',
    user_message: 'верни Кота',
    thinking:
      'Пользователь просит вернуть персонажа. Проверяю <characters_archived>: ' +
      'есть персонаж "Кот" с id "c_archived_kot". ' +
      'Вызываю unarchive_character с этим id.',
    tool_calls: [{ name: 'unarchive_character', args: { character_id: 'c_archived_kot' } }],
    reply: 'Кот возвращён в активный состав.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. unarchive-miss
  // "верни Рыбу" + Рыба не в архиве → conversational reply, no tool
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'unarchive-miss',
    user_message: 'верни Рыбу',
    thinking:
      'Пользователь хочет восстановить персонажа из архива. ' +
      'Проверяю <characters_archived>: персонажа с именем "Рыба" нет ни в архиве, ни в активных. ' +
      'Вызывать unarchive_character нельзя — нет подходящего id. ' +
      'Отвечаю текстом и предлагаю показать архив.',
    tool_calls: [],
    reply:
      'В архиве нет персонажа с именем «Рыба». Возможно, ты имел в виду другого? Покажу архив, если нужно.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. set-voice-audio-guard
  // "замени голос Кота на серьёзный" → set_character_voice (happy path)
  // The tool itself enforces the audio-lock guard server-side; the Director
  // calls it and surfaces the result faithfully.
  // ─────────────────────────────────────────────────────────────────────────
  {
    label: 'set-voice-audio-guard',
    user_message: 'замени голос Кота на серьёзный',
    thinking:
      'Пользователь хочет сменить голос персонажа "Кот". ' +
      'В пуле голосов "серьёзный мужской" — это Daniel (id: onwK4e9ZLuTAKqWW03F9, tone: серьёзный). ' +
      'Вызываю set_character_voice. ВАЖНО: если у персонажа уже есть отрендеренное аудио в любой сцене, ' +
      'сервер вернёт voice_locked error — это guard нельзя обойти на стороне директора, ' +
      'нужно передать ошибку пользователю дословно.',
    tool_calls: [
      {
        name: 'set_character_voice',
        args: {
          character_id: 'c1',
          tts_voice_id: 'onwK4e9ZLuTAKqWW03F9',
        },
      },
    ],
    reply: 'Голос Кота заменён на Daniel — серьёзный мужской диктор.',
  },
] as const;
