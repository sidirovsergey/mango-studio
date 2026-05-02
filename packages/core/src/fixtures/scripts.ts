import type { Scene, ScriptGenOutput } from '../llm/provider';

function fixtureScene(
  scene_id: string,
  description: string,
  duration_sec: number,
  voiceoverText?: string,
): Scene {
  return {
    scene_id,
    description,
    duration_sec,
    dialogue: voiceoverText ? { speaker: 'narrator', text: voiceoverText } : null,
    character_ids: [],
    first_frame_source: 'auto_continuity',
    first_frame: null,
    last_frame: null,
    video: null,
    voice_audio: null,
    final_clip: null,
  };
}

export const demoScripts: Record<string, ScriptGenOutput> = {
  default: {
    title: 'Дэнни ищет работу',
    scenes: [
      fixtureScene(
        's1',
        'Дэнни радостно подплывает к стойке регистрации с резюме в плавнике.',
        8,
        'Сегодня у меня собеседование. Я готов на всё, чтобы получить работу!',
      ),
      fixtureScene(
        's2',
        'Джек, прищурившись, листает его резюме клешнёй.',
        6,
        'Так… в резюме написано "хорошо плаваю". И это всё?',
      ),
      fixtureScene(
        's3',
        'Первая преграда: Дэнни не может печатать на клавиатуре — у него нет пальцев.',
        8,
        'Нам нужен кто-то, кто умеет печатать. У тебя даже пальцев нет!',
      ),
      fixtureScene(
        's4',
        'Вторая преграда: его не пускают в кабинет, потому что он не помещается в дверь.',
        8,
      ),
      fixtureScene(
        's5',
        'Развязка: Джек предлагает ему стать инструктором по плаванию для младших крабиков. Идеально.',
        10,
      ),
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
    master_clip: null,
  },
};
