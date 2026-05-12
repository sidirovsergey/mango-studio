export type Style = '3d_pixar' | '2d_drawn' | 'clay_art';

export interface CharacterForPrompt {
  name: string;
  description: string;
  full_prompt?: string;
  appearance: {
    age?: string;
    build?: string;
    species?: string;
    distinctive?: string[];
  };
  personality?: string;
}

export const STYLE_PREAMBLE: Record<Style, string> = {
  '3d_pixar':
    '3D Pixar-style CGI рендер, мягкое объёмное освещение, выразительные глаза, мультяшные пропорции, проработанные текстуры. Образец стиля: Pixar «Coco» / «Soul» / «Encanto» — насыщенная палитра, мягкий объёмный контровой свет, большие выразительные глаза, субповерхностное рассеивание на коже.',
  '2d_drawn':
    '2D рисованная иллюстрация, чистая обводка, плоская заливка цветом, выразительные пропорции, акцентные блики, без шейдинга и текстур. Образец стиля: Studio Ghibli «Мой сосед Тоторо» / «Принцесса Мононоке» — выразительный контур, сдержанная палитра, плавные линии.',
  clay_art:
    'Скульптура из пластилина (clay-art стиль), видимая текстура материала, мягкие округлые формы, лёгкие отпечатки пальцев на поверхности, тёплое студийное освещение. Образец стиля: Aardman «Уоллес и Громит» / «Побег из курятника» — фактурная поверхность пластилина, сочные цвета, характерная мягкая деформация форм.',
};

const STYLE_NAME: Record<Style, string> = {
  '3d_pixar': '3D Pixar',
  '2d_drawn': '2D рисованная',
  clay_art: 'Clay-art (пластилин)',
};

function compileAppearance(a: CharacterForPrompt['appearance']): string {
  const parts: string[] = [];
  if (a.species) parts.push(a.species);
  if (a.age) parts.push(`возраст: ${a.age}`);
  if (a.build) parts.push(a.build);
  if (a.distinctive?.length) parts.push(`характерные черты: ${a.distinctive.join(', ')}`);
  return parts.join(', ');
}

export function buildAvatarPrompt(char: CharacterForPrompt, style: Style): string {
  const appearance = compileAppearance(char.appearance);
  const personalityBlock = char.personality ? `\nХарактер: ${char.personality}.` : '';

  return `Жёсткое правило: стиль — ${STYLE_NAME[style]}.

Portrait shot, head and shoulders, neutral solid background, eye-level angle.
Один персонаж крупным планом:
- Голова и плечи, лицо занимает центр кадра
- Выразительное нейтральное или слегка улыбающееся выражение
- Взгляд немного в сторону от камеры (3/4 поворот)
- Максимум деталей лица: глаза, нос, рот, характерные черты

Персонаж: ${char.name}.
Описание: ${char.description}.
Внешность: ${appearance}.${personalityBlock}

Стиль (применяется только к персонажу, НЕ к фону):
${STYLE_PREAMBLE[style]}

Фон: чистый белый #FFFFFF, без окружения, без теней на фоне.
Свет на персонаже: ровный, профессиональный студийный свет, мягкий ключевой источник.

Формат: квадратное изображение 1:1, один субъект.

Avoid: text in image, captions, watermarks, signature, multiple characters, multiple poses, full body composition, environment, props beyond intrinsic costume.`;
}

export function buildDossierPrompt(char: CharacterForPrompt, style: Style): string {
  const appearance = compileAppearance(char.appearance);
  const personalityBlock = char.personality ? `\nХарактер: ${char.personality}.` : '';

  return `Жёсткое правило: стиль — ${STYLE_NAME[style]}.

Multi-pose character design sheet. Required views: front view, 3/4 view, side view, back view. Each pose on neutral solid background, evenly spaced.
Optionally include 1-2 expression variants (neutral, smile, surprised).

Model-sheet персонажа на ЧИСТО БЕЛОМ фоне, качество профессиональной анимационной студии.
Расположи несколько изображений персонажа в одной широкоформатной картинке 16:9:
- Несколько выражений лица: подписать «Радостный», «Грустный», «Удивлённый», «Злой», «Нейтральный»
- Несколько поз тела: подписать «Стоя», «Сидя», «В действии», «Повседневная»
- Крупные планы характерных деталей: подписать «Лицо», «Жест руки», «Отличительная черта», «Хвост»
- Каждое изображение чётко отделено естественным пространством белого фона; ячейки разделены равномерными белыми полями около 5% ширины холста; без рамок, обводки и разделительных линий между ячейками
- Единый дизайн персонажа во всех изображениях

Персонаж: ${char.name}.
Описание: ${char.description}.
Внешность: ${appearance}.${personalityBlock}

Стиль (применяется только к персонажу, НЕ к фону):
${STYLE_PREAMBLE[style]}

Фон: чистый белый #FFFFFF, без окружения, без теней на фоне.
Свет на персонаже: ровный, профессиональный студийный свет, мягкий ключевой источник.

Формат: широкоформатное изображение 16:9, одна композиция.

КРИТИЧЕСКОЕ требование к тексту: ВСЕ подписи под ячейками model-sheet — ТОЛЬКО на русском языке кириллицей. Никаких английских слов в изображении (никаких «Joyful», «Sad», «Standing», «Action», «Head/Face», «Distinctive Feature» и т.п.). Используй ИМЕННО те русские подписи, что перечислены выше. Подписи небольшим аккуратным шрифтом под каждой ячейкой.

Avoid: text in image, captions, watermarks, signature, single pose, environment, props beyond intrinsic costume, dynamic action, dramatic lighting that obscures design.`;
}
