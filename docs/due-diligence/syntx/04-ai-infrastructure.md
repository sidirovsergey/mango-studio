# Этап 4 — AI-инфраструктура: сравнение провайдеров

Все цены — июль 2026, из первичных pricing-страниц провайдеров (см. ссылки), собраны исследовательским агентом с явной верификацией по live-страницам. Где цена не найдена напрямую — помечено. Полная методология и все найденные модели — см. отчёт ниже по разделам; здесь — таблицы для принятия решения "через какой API подключать".

## 4.1 Текст / LLM

| Категория | Провайдер | Модель | Вход $/1M ток. | Выход $/1M ток. | Комментарий |
|---|---|---|---:|---:|---|
| Флагман (качество) | Anthropic (прямо) | Claude Opus 4.8 | $5.00 | $25.00 | Fast-mode 2x дороже; batch −50% |
| Флагман (качество) | Anthropic (прямо) | Claude Sonnet 5 | $2.00→$3.00* | $10.00→$15.00* | *цена растёт с 1 сент. 2026 |
| Флагман (качество) | Google | Gemini 3.1 Pro | $2.00/$4.00 | $12.00/$18.00 | Дороже при >200K контекста |
| Бюджет | Anthropic | Claude Haiku 4.5 | $1.00 | $5.00 | Самый дешёвый current-gen Anthropic |
| Бюджет | Google | Gemini 2.5 Flash-Lite | $0.10 | $0.40 | Самый дешёвый в линейке Google |
| Открытые веса (дёшево) | Groq | Llama 4 Scout | $0.11 | $0.34 | 594 ток/с — самый быстрый инференс на рынке |
| Открытые веса (дёшево) | DeepInfra | Llama-4-Maverick FP8 | $0.15 | $0.60 | — |
| Открытые веса (дёшево) | DeepSeek (прямо) | DeepSeek-V4-Flash | $0.0028(hit)/$0.14 | $0.28 | Дешевле через прямой API, чем через роутеры |
| Роутер | OpenRouter | DeepSeek V4 Flash | $0.077 | $0.154 | +до 5.5% комиссии за pay-as-you-go, без наценки на модель |

**Рекомендация:** для чата в MVP — Claude Haiku 4.5 или Gemini 2.5 Flash-Lite как основа (низкая себестоимость, хорошее качество), Llama через Groq/DeepInfra как максимально дешёвый fallback при высокой нагрузке. OpenRouter — как единая точка интеграции на старте (меньше кода), с прямой миграцией на конкретных провайдеров по мере роста объёма (экономия на комиссии 5.5%).

Источники: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Groq pricing](https://groq.com/pricing), [DeepInfra pricing](https://deepinfra.com/pricing), [OpenRouter pricing](https://openrouter.ai/pricing), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

## 4.2 Изображения

| Провайдер | Модель | Цена | Комментарий |
|---|---|---:|---|
| **Runware** | Flux Schnell | **$0.0006/изобр.** | Самая дешёвая генерация из всех найденных — в 60x дешевле fal.ai Kontext Pro |
| DeepInfra | Flux-2-pro | $0.015/изобр. | — |
| fal.ai | Flux Kontext Pro | $0.04/изобр. | Редактирование по промпту |
| Together AI | Flux.1 schnell | $0.0027/мегапиксель | — |
| Replicate | Flux 1.1 Pro | $0.04/изобр. | — |
| Google (Gemini API) | Imagen 4 (Fast/Std/Ultra) | $0.02/$0.04/$0.06 | Прямой API Google |
| Google (Gemini API) | Nano Banana (Gemini 2.5 Flash Image) | $0.039 (standard) / $0.0195 (batch) | Именно эту модель использует SYNTX под тем же названием |
| Ideogram (прямо) | Ideogram 4.0 Turbo | $0.03/изобр. | — |

**Midjourney: официального API нет** — при желании реплицировать этот функционал у SYNTX нужно либо использовать неофициальные обёртки (юридический риск), либо заменить визуально сопоставимым Flux/Imagen/Nano Banana.

**Рекомендация:** Runware/DeepInfra для бюджетного тарифа (Flux schnell/pro), Google Imagen/Nano Banana напрямую или через fal.ai для премиум-тарифа. Не использовать неофициальный Midjourney API.

Источники: [Runware pricing](https://runware.ai/pricing), [DeepInfra pricing](https://deepinfra.com/pricing), [fal.ai pricing](https://fal.ai/pricing), [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Ideogram pricing](https://ideogram.ai/api-pricing/).

## 4.3 Видео

| Провайдер | Модель | Цена | Комментарий |
|---|---|---:|---|
| fal.ai | Wan 2.5 | **$0.05/сек** | Самое дешёвое видео из найденных |
| fal.ai / Novita | Kling 2.5/3.0 Turbo Pro | $0.07–0.17/сек | Средний сегмент |
| Runway (официальный API) | Gen-4 Turbo | $0.05/сек | Дёшево для Runway-качества |
| fal.ai | Veo 3 | $0.40/сек | Реселлер дешевле прямого Google |
| Google Vertex AI (прямо) | Veo 3 | $0.50–0.75/сек | Дороже, чем через fal.ai — аномалия, характерная для видео-API |
| OpenAI (прямо) | Sora-2 / Sora-2 Pro | $0.10/сек / $0.30–0.70/сек | — |

**Ключевой вывод:** видео на 1-2 порядка дороже фото ($0.05-0.75/сек против $0.0006-0.06/изображение) — это определяет всю юнит-экономику продукта (см. Этап 6-7). Роутинг "черновик → Wan/Kling, финал → Veo/Sora" — стандартная практика снижения себестоимости.

Источники: [fal.ai pricing](https://fal.ai/pricing), [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/), [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Novita pricing](https://novita.ai/pricing).

## 4.4 Аудио / голос / музыка

| Провайдер | Модель | Цена | Комментарий |
|---|---|---:|---|
| ElevenLabs (прямо) | Multilingual v2/v3 TTS | $0.10/1000 симв. | Эталон качества голоса/клонирования |
| ElevenLabs (прямо) | Flash/Turbo TTS | $0.05/1000 симв. | Быстрее, ниже качество |
| Groq | Orpheus TTS | $22/1M симв. (~$0.022/1000) | В разы дешевле ElevenLabs |
| Groq | Whisper Large V3 Turbo | **$0.04/час** | Самая дешёвая транскрибация (STT) из найденных |
| Novita | Fish Audio TTS | $15/1M симв. | — |
| Suno | — | Официального API нет | Только неофициальные реселлеры ($0.014-0.111/трек) — юридический риск |

**Рекомендация:** ElevenLabs для премиум-голоса/клонирования, Groq Orpheus/Whisper для бюджетных TTS/STT операций. Музыку (Suno-аналог) в MVP не включать из-за отсутствия легального API — риск для юнит-экономики и репутации при внезапной блокировке неофициального доступа.

Источники: [ElevenLabs pricing](https://elevenlabs.io/pricing/api), [Groq pricing](https://groq.com/pricing), [Novita pricing](https://novita.ai/pricing).

## 4.5 Утилиты (upscale, удаление фона)

| Провайдер | Операция | Цена |
|---|---|---:|
| Segmind | Upscale (Pruna P) | **$0.005/изобр.** |
| fal.ai | Clarity Upscaler | $0.03/мегапиксель |
| fal.ai | Bria RMBG 2.0 (удаление фона) | $0.018/изобр. |
| Novita | Удаление фона | $0.017/изобр. |
| Recraft | Crisp Upscale | $0.004/изобр. |

Дешёвая commodity-категория — не критична для выбора провайдера, роутинг по доступности/latency.

## 4.6 Сводные выводы по стратегии подключения

1. **Ни один провайдер не покрывает все 4 модальности конкурентоспособно** — нужна мультипровайдерная интеграция минимум из 3-4 сервисов, что подтверждает архитектурное решение Этапа 3 (AI Gateway как отдельный слой, а не прямые вызовы).
2. **Агрегаторы (fal.ai, Replicate, OpenRouter, Novita) снижают затраты на интеграцию, но почти никогда не самые дешёвые** на конкретную модель — прямые нишевые хостеры (Runware, DeepInfra, Groq) дешевле в 2-60 раз на отдельных моделях. Стратегия: **старт через агрегаторы** (скорость разработки), **миграция на прямых провайдеров** для моделей с наибольшим объёмом трафика после запуска (экономия маржи).
3. **Rate limits и concurrency** — не подтверждены как жёсткое ограничение для нашего масштаба на старте (fal.ai: 2 concurrent на новых аккаунтах, растёт до 40 при росте трат; Groq free tier ограничен, но платный масштабируется). Требует отдельного технического due diligence перед выбором финального провайдера на этапе роста >10k MAU.
4. **Два заявленных в ТЗ провайдера не имеют официального публичного API для нужных моделей**: Midjourney и Suno. Оба исключены из MVP-скоупа с пометкой "юридический риск" (см. `risk-assessment.md`).
