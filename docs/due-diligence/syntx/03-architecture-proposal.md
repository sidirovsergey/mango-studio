# Этап 3 — Предлагаемая техническая архитектура собственного продукта

Это архитектура **нашего** будущего продукта (рабочее имя ниже — "Nusa AI", placeholder), спроектированная так, чтобы быть проще в эксплуатации, чем то, что мы реконструировали у SYNTX (см. `01-reverse-engineering.md`), и оптимизированной для Telegram-first дистрибуции на рынок Индонезии.

Статус: **[EST]** — это предложение архитектуры, не факт о SYNTX. Опирается на индустриальные паттерны (Telegram Bot API, fal.ai/OpenRouter как в текущем стеке Mango Studio, Supabase) и на опыт, уже накопленный в этом репозитории (`apps/web`, `packages/core`, `packages/db`, fal.ai + OpenRouter интеграция).

## 3.1 Принципы

1. **Telegram как основной канал** — Mini App + Bot вместо отдельного мобильного приложения. Снижает CAC и обходит App Store/Play Store комиссии (30%) и модерацию генеративного контента.
2. **AI Gateway как единая точка входа к моделям** — все вызовы к внешним AI-провайдерам идут через один внутренний сервис с логированием стоимости, ретраями, фолбэком между провайдерами и рейт-лимитами. Это то место, где произошли реальные инциденты в Mango Studio (см. `git log`: `fal ffmpeg`, `queue status → pending`, `atomic finalize`) — типовой источник багов в таких системах, поэтому закладываем его как первоклассный компонент, а не рядовой fetch-вызов.
3. **Wallet/Billing отделены от Generation** — баланс токенов и биллинг — это транзакционная система (Postgres + RLS), генерация — это очередь с воркерами. Разделение убирает риск гонок (race condition), с которым уже сталкивался этот проект (`c1adbef hotfix(data-loss): mirror jsonb write-back race lost scene versions`).
4. **Идемпотентность и Outbox** — каждый платёж и каждая генерация имеют идемпотентный ключ; списание токенов и постановка задачи в очередь происходят в одной транзакции (outbox pattern), чтобы не терять и не дублировать списания при сбое воркера.
5. **Мультипровайдерность на уровне конфигурации, не кода** — каждая модель (Flux, Kling, GPT, Claude и т.д.) регистрируется в реестре моделей с 1..N бэкендами-провайдерами и правилом выбора (цена/скорость/доступность), чтобы менять провайдера без релиза.

## 3.2 Диаграмма компонентов (C2)

```mermaid
flowchart TB
    subgraph Clients["Клиенты"]
        TMA["Telegram Mini App\n(React/Vite WebApp)"]
        TBOT["Telegram Bot\n(long-poll/webhook)"]
        WEB["Web App (опционально, Next.js)"]
        ADMIN["Admin Panel\n(внутренний, Next.js)"]
    end

    subgraph Edge["Edge / Gateway"]
        CDN["CDN (Cloudflare)"]
        APIGW["API Gateway\n(auth, rate-limit, routing)"]
    end

    subgraph Core["Backend Core"]
        AUTH["Auth Service\n(Telegram initData verify, OTP web)"]
        WALLET["Billing & Wallet Service\n(токены, подписки, транзакции)"]
        CATALOG["Model Registry / Catalog\n(модели, цены, провайдеры)"]
        GENAPI["Generation API\n(создание job, статус, история)"]
        AIGW["AI Gateway\n(унифицированный клиент к провайдерам,\nфолбэк, ретраи, стоимость)"]
        NOTIFY["Notification Service\n(Telegram push, webhooks)"]
    end

    subgraph Async["Асинхронный слой"]
        QUEUE["Queue\n(Redis Streams / SQS)"]
        WORKERS["Workers\n(image / video / audio / text)"]
        SCHED["Scheduler / Cron\n(subs renewal, cleanup)"]
    end

    subgraph Data["Данные"]
        PG[("PostgreSQL\n(users, wallets, jobs, subs)")]
        REDIS[("Redis\n(cache, rate-limit, session)")]
        VEC[("Vector DB\n(pgvector) — история промптов,\nсемантический поиск, RAG для чата")]
        OBJ[("Object Storage\nS3-compatible (медиа)")]
    end

    subgraph External["Внешние сервисы"]
        AIPROV["AI Providers\nfal.ai / OpenRouter / Replicate /\nOpenAI / Anthropic / Google"]
        PAY["Платёжные провайдеры\nQRIS / GoPay / OVO / DANA /\nMidtrans / Xendit / карты"]
        TG["Telegram Bot API"]
    end

    subgraph Obs["Observability"]
        LOG["Logging\n(structured, Loki/CloudWatch)"]
        MON["Monitoring & Alerts\n(Prometheus/Grafana, Sentry)"]
        ANALYTICS["Product Analytics\n(PostHog/Amplitude)"]
    end

    TMA --> CDN --> APIGW
    TBOT <--> TG
    TBOT --> APIGW
    WEB --> CDN
    ADMIN --> APIGW

    APIGW --> AUTH
    APIGW --> GENAPI
    APIGW --> WALLET
    APIGW --> CATALOG

    GENAPI --> WALLET
    GENAPI --> QUEUE
    WALLET --> PG
    AUTH --> PG
    CATALOG --> PG

    QUEUE --> WORKERS
    WORKERS --> AIGW
    AIGW --> AIPROV
    WORKERS --> OBJ
    WORKERS --> PG
    WORKERS --> NOTIFY
    NOTIFY --> TG

    WALLET --> PAY
    PAY -. webhook .-> APIGW

    GENAPI --> REDIS
    APIGW --> REDIS
    GENAPI -. embeddings .-> VEC

    SCHED --> WALLET
    SCHED --> QUEUE

    Core -.-> LOG
    Async -.-> LOG
    LOG --> MON
    Core -.-> ANALYTICS
```

## 3.3 User flow — генерация изображения (пример)

```mermaid
sequenceDiagram
    actor U as Пользователь (Telegram)
    participant TMA as Mini App
    participant GW as API Gateway
    participant GEN as Generation API
    participant W as Wallet Service
    participant Q as Queue
    participant WK as Worker
    participant AI as AI Gateway
    participant PROV as fal.ai/Provider
    participant OBJ as Object Storage

    U->>TMA: Вводит промпт, выбирает модель (Flux Pro)
    TMA->>GW: POST /generate {model, prompt, params}
    GW->>GEN: forward (authenticated)
    GEN->>W: hold(tokens_estimate)
    alt Недостаточно токенов
        W-->>GEN: insufficient_balance
        GEN-->>TMA: 402 + предложение купить/оформить подписку
    else Баланс ок
        W-->>GEN: hold_id (резерв токенов)
        GEN->>Q: enqueue job(job_id, hold_id)
        GEN-->>TMA: 202 {job_id, status: pending}
        TMA->>U: Показывает прогресс генерации

        Q->>WK: pop job
        WK->>AI: generate(model, prompt, params)
        AI->>PROV: submit
        PROV-->>AI: async result / webhook
        AI-->>WK: media_url / bytes
        WK->>OBJ: store media
        WK->>W: commit(hold_id, actual_cost)
        WK->>GEN: update job status = done
        GEN-->>TMA: push (webhook/poll) result
        TMA->>U: Показывает результат
    end
```

## 3.4 Схема данных (ER, ключевые сущности)

```mermaid
erDiagram
    USERS ||--o{ WALLETS : has
    USERS ||--o{ SUBSCRIPTIONS : has
    USERS ||--o{ GENERATION_JOBS : creates
    WALLETS ||--o{ WALLET_TRANSACTIONS : logs
    SUBSCRIPTIONS ||--o{ WALLET_TRANSACTIONS : grants
    GENERATION_JOBS ||--o{ GENERATION_ASSETS : produces
    GENERATION_JOBS }o--|| MODELS : uses
    MODELS ||--o{ MODEL_PROVIDERS : "routes to"
    MODEL_PROVIDERS }o--|| PROVIDERS : "hosted by"

    USERS {
        uuid id PK
        bigint telegram_id UK
        text locale
        timestamptz created_at
    }
    WALLETS {
        uuid id PK
        uuid user_id FK
        numeric balance_tokens
        timestamptz updated_at
    }
    WALLET_TRANSACTIONS {
        uuid id PK
        uuid wallet_id FK
        text type "topup|spend|refund|bonus|sub_grant"
        numeric amount
        text idempotency_key UK
        timestamptz created_at
    }
    SUBSCRIPTIONS {
        uuid id PK
        uuid user_id FK
        text tier
        text status
        timestamptz renews_at
    }
    GENERATION_JOBS {
        uuid id PK
        uuid user_id FK
        uuid model_id FK
        text status
        numeric cost_tokens
        jsonb params
        timestamptz created_at
    }
    GENERATION_ASSETS {
        uuid id PK
        uuid job_id FK
        text storage_url
        text kind "image|video|audio|text"
    }
    MODELS {
        uuid id PK
        text name
        text category
        numeric price_tokens_per_unit
    }
    MODEL_PROVIDERS {
        uuid id PK
        uuid model_id FK
        uuid provider_id FK
        int priority
        numeric cost_usd_per_unit
    }
    PROVIDERS {
        uuid id PK
        text name
        text api_base
    }
```

## 3.5 Разбивка по слоям (соответствие ТЗ)

| Слой | Технология (рекомендация) | Обоснование |
|---|---|---|
| **Frontend / Telegram Mini App** | React + Vite, Telegram WebApp SDK, Tailwind | Быстрый старт, соответствует уже используемому в Mango Studio Next.js/Tailwind стеку по духу |
| **Telegram Bot** | Node.js (grammY или Telegraf) как отдельный сервис | Отделён от Mini App backend, чтобы webhook-нагрузка бота не блокировала API |
| **Backend Core / API Gateway** | Next.js API routes или отдельный Fastify/NestJS сервис | В текущем репо уже Next.js API routes (`apps/web`) — можно переиспользовать паттерн, но при росте нагрузки вынести generation-api в отдельный сервис |
| **AI Gateway** | Собственный TS/Python сервис-обёртка над fal.ai/OpenRouter/Replicate/etc | Централизует стоимость, ретраи, фолбэк — критично после инцидентов с "fal ffmpeg", "queue status pending" в текущем проекте |
| **Queue** | Redis Streams (старт) → SQS/Kafka (масштаб) | Redis уже используется как кэш/rate-limit, можно переиспользовать инфраструктуру на старте, не вводя лишний сервис |
| **Workers** | Node.js/Python worker pool, авто-скейл по длине очереди | Разделение по типу job (image/video/audio/text) — video job тяжелее и дольше |
| **Billing & Wallet** | Postgres + RLS (как уже в `supabase/migrations`), строгая транзакционность | В репо уже есть паттерн `billing_payments`, `MOCK_YOOKASSA` — переносим на индонезийские платёжные рельсы (Midtrans/Xendit) |
| **Object Storage** | S3-compatible (Supabase Storage на старте → Cloudflare R2/AWS S3 при росте, дешевле egress) | Media (фото/видео) — основной драйвер объёма хранилища |
| **CDN** | Cloudflare | Дёшево, глобальный edge, важно для латентности в Индонезии (Jakarta PoP) |
| **Database** | PostgreSQL (Supabase managed на старте) | Уже отработанный стек в этом репо, RLS даёт multi-tenant безопасность "из коробки" |
| **Vector DB** | pgvector расширение в том же Postgres | Не нужен отдельный сервис (Pinecone/Weaviate) при объёме <10M векторов — экономия инфраструктуры |
| **Monitoring** | Sentry (ошибки) + Grafana/Prometheus или Better Stack (метрики) | Полезность подтверждена историей репо — множество hotfix-коммитов про "atomic finalize", "poller stop being blind" указывают, что observability должен быть заложен с первого дня, а не добавлен постфактум |
| **Analytics** | PostHog (self-host опция снимает вопрос экспорта данных пользователей Индонезии за рубеж) | Учитывает требования локализации данных (см. `10-recommendations.md` про UU PDP) |
| **Admin Panel** | Next.js внутреннее приложение поверх тех же API | Управление моделями/ценами/промо без деплоя |
| **CI/CD** | GitHub Actions → Vercel (frontend) + Fly.io/Railway/Hetzner (workers, stateful) | В репо уже `.vercelignore`, значит Vercel — текущий выбор для web; воркеры и GPU-часть требуют non-serverless хостинга |

## 3.6 Почему не как у SYNTX (предположительно)

По косвенным признакам (см. `01-reverse-engineering.md`) SYNTX, вероятно, использует монолитный backend без выраженного AI Gateway слоя — отсюда типичные для таких продуктов проблемы: сложность добавления новых моделей, отсутствие единого контроля себестоимости в реальном времени, риск рассинхронизации баланса токенов при сбоях провайдера. Наша архитектура целенаправленно выносит это в отдельные слои (AI Gateway, Wallet-as-ledger с idempotency), чтобы:

1. Новую модель можно было подключить конфигурацией (запись в `MODEL_PROVIDERS`), а не кодом.
2. Списание токенов было строго консистентно с фактическим успехом/неудачей генерации (hold → commit/release).
3. Себестоимость по каждой генерации логировалась сразу (`cost_usd_per_unit` в `MODEL_PROVIDERS` + фактический ответ провайдера), что даёт данные для FinOps в реальном времени — то, что в Этапе 6 нам пришлось **оценивать** у SYNTX косвенно именно потому, что у них это внутренняя, непубличная система.
