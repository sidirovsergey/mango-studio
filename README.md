# Mango Studio

> AI-режиссёр коротких вертикальных мультиков (TikTok / Reels / Shorts) из одной строки.

**Production app:** https://www.mangopro.ru
**Demo (legacy / 1:1 mockup):** https://mango-studio-demo.vercel.app/

> **Phase 0 status: ✅ Complete** (2026-04-27) — foundation, monorepo, design tokens, provider contracts (mock impl), Supabase scaffold, и полный порт демо на боевой стек. Готово к Фазе 1 (real fal.ai + OpenRouter).

---

## Стек

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind v4
- **Backend:** Next.js API routes / Server Actions, Faraday-cage architecture
- **Хостинг:** Vercel (serverless)
- **БД:** Supabase Postgres + Auth (Auth подключается в Фазе 2)
- **AI провайдеры:** fal.ai (медиа) + OpenRouter (LLM) — подключаются в Фазе 1
- **Инструменты:** pnpm 9 + Turborepo 2 + Biome + Vitest

## Локальная разработка

```bash
# Один раз — установить зависимости
pnpm install

# Скопировать env, заполнить ключами Supabase staging
cp .env.example .env.local

# Запустить dev-сервер
pnpm dev
```

Откроется на `http://localhost:3000`.

## Структура

См. `apps/web/` (Next.js app), `packages/{core,ui,db}/` (shared packages).

## Скрипты

| Команда | Что делает |
|---------|------------|
| `pnpm dev` | Next.js dev-server (hot reload) |
| `pnpm build` | Production build |
| `pnpm lint` | Biome lint |
| `pnpm typecheck` | TypeScript check всех packages |
| `pnpm test` | Vitest |
| `pnpm db:gen` | Регенерировать типы из Supabase schema |

## Документация

- Spec Фазы 0: `docs/superpowers/specs/2026-04-26-phase-0-foundation-design.md` (в репо `mango-studio-production`)
- Plan Фазы 0: `docs/superpowers/plans/2026-04-26-phase-0-foundation.md` (там же)

## Лицензия

[MIT](LICENSE)
