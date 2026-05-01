import type { MediaErrorCode } from '@mango/core';

export function friendlyMediaError(code: MediaErrorCode, raw: string): string {
  switch (code) {
    case 'forbidden':
      return 'Сервис генерации изображений отклонил запрос (проверь FAL_KEY в Vercel ENV)';
    case 'rate_limit':
      return 'Слишком много запросов к генератору. Попробуй через минуту.';
    case 'invalid_input':
      return `Некорректные параметры запроса: ${raw}`;
    case 'model_unavailable':
      return 'Модель временно недоступна. Попробуй другую модель или подожди.';
    case 'timeout':
      return 'Генерация заняла слишком много времени. Попробуй ещё раз.';
    case 'budget_exceeded':
      return 'Превышен дневной бюджет на генерацию изображений.';
    case 'unknown':
      return `Неизвестная ошибка генерации: ${raw}`;
  }
}
