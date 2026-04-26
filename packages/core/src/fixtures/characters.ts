import type { CharacterDescriptor } from '../prompt/types';

const dolphin: CharacterDescriptor = {
  char_id: 'dolphin',
  name: 'Дэнни',
  canonical_description: 'Оптимистичный дельфин, ищет работу. С новыми очками.',
  short_tag: 'Дэнни',
  reference_image_urls: [],
};

const crab: CharacterDescriptor = {
  char_id: 'crab',
  name: 'Джек',
  canonical_description: 'Сердитый менеджер по найму. Сидит за столом из коралла.',
  short_tag: 'Джек',
  reference_image_urls: [],
};

const octopus: CharacterDescriptor = {
  char_id: 'octopus',
  name: 'Лили',
  canonical_description: 'Секретарь. Печатает восемью щупальцами одновременно.',
  short_tag: 'Лили',
  reference_image_urls: [],
};

const fox: CharacterDescriptor = {
  char_id: 'fox',
  name: 'Грейс',
  canonical_description: 'Хитрая лиса-рекрутер, читает тебя на сквозь.',
  short_tag: 'Грейс',
  reference_image_urls: [],
};

const bear: CharacterDescriptor = {
  char_id: 'bear',
  name: 'Тэдди',
  canonical_description: 'Уютный CEO-медведь, любит совещания у камина.',
  short_tag: 'Тэдди',
  reference_image_urls: [],
};

export const demoCharacters: Record<string, CharacterDescriptor> = {
  dolphin,
  crab,
  octopus,
  fox,
  bear,
  default: dolphin,
};
