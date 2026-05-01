import type { ScriptGenOutput } from '../llm/provider';

export const demoScripts: Record<string, ScriptGenOutput> = {
  default: {
    title: 'Дэнни ищет работу',
    scenes: [
      {
        scene_id: 's1',
        description: 'Дэнни радостно подплывает к стойке регистрации с резюме в плавнике.',
        duration_sec: 8,
        voiceover: 'Сегодня у меня собеседование. Я готов на всё, чтобы получить работу!',
      },
      {
        scene_id: 's2',
        description: 'Джек, прищурившись, листает его резюме клешнёй.',
        duration_sec: 6,
        voiceover: 'Так… в резюме написано "хорошо плаваю". И это всё?',
      },
      {
        scene_id: 's3',
        description: 'Первая преграда: Дэнни не может печатать на клавиатуре — у него нет пальцев.',
        duration_sec: 8,
        voiceover: 'Нам нужен кто-то, кто умеет печатать. У тебя даже пальцев нет!',
      },
      {
        scene_id: 's4',
        description:
          'Вторая преграда: его не пускают в кабинет, потому что он не помещается в дверь.',
        duration_sec: 8,
      },
      {
        scene_id: 's5',
        description:
          'Развязка: Джек предлагает ему стать инструктором по плаванию для младших крабиков. Идеально.',
        duration_sec: 10,
      },
    ],
    characters: [
      {
        action: 'add',
        name: 'Дэнни',
        description: 'Оптимистичный дельфин, ищет работу. С новыми очками.',
      },
      {
        action: 'add',
        name: 'Джек',
        description: 'Сердитый менеджер по найму. Сидит за столом из коралла.',
      },
      {
        action: 'add',
        name: 'Лили',
        description: 'Секретарь. Печатает восемью щупальцами одновременно.',
      },
      { action: 'add', name: 'Грейс', description: 'Хитрая лиса-рекрутер, читает тебя на сквозь.' },
      {
        action: 'add',
        name: 'Тэдди',
        description: 'Уютный CEO-медведь, любит совещания у камина.',
      },
    ],
  },
};
