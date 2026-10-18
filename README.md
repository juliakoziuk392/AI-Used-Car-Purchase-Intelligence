# CarIntel — AI Used-Car Purchase Intelligence

AI-асистент для перевірки оголошень про продаж вживаних авто: оцінка ризиків, ринкова ціна, аргументи для торгу.

## Стек

| Шар | Технології |
| --- | --- |
| Frontend (`apps/web`) | React 19 + Vite, TanStack Query, React Router, Tailwind CSS 4, React Hook Form + zod |
| Backend (`apps/api`) | NestJS 11, Sequelize 6 (`sequelize-typescript`), JWT |
| Дані | PostgreSQL 16 + pgvector, Redis (BullMQ), MinIO (S3) |
| Спільне (`packages/shared`) | zod-схеми, enum-и та DTO, які використовують і бек, і фронт |

Монорепо: pnpm workspaces + Turborepo.

## Структура

```
apps/
  api/            NestJS API
    db/           конфіг sequelize-cli і міграції
    src/
      auth/       реєстрація, логін, JWT guard
      listings/   CRUD оголошень
      analyses/   запуск і перегляд аналізів
      database/   Sequelize-моделі
  web/            React-клієнт
packages/
  shared/         zod-схеми + типи DTO
docker-compose.yml  Postgres+pgvector, Redis, MinIO
```

## Запуск локально

Потрібні Node.js 20+ і Docker.

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # Postgres, Redis, MinIO
pnpm db:migrate      # створює таблиці й розширення vector
pnpm dev             # API на :3000, web на :5174
```

> Якщо `pnpm` не встановлено, кожну команду можна запускати як `npx pnpm@9.15.0 <команда>`
> або встановити глобально: `npm i -g pnpm@9`.

Web-клієнт проксіює `/api` на `http://localhost:3000`.

## API (етап 1)

| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/api/health` | Стан API та БД |
| POST | `/api/auth/register` | Реєстрація → `{ accessToken, user }` |
| POST | `/api/auth/login` | Логін → `{ accessToken, user }` |
| GET | `/api/auth/me` | Поточний користувач |
| GET | `/api/listings` | Оголошення користувача |
| POST | `/api/listings` | Створити оголошення: лише `url` і `price`, авто й пробіг дістаються зі сторінки |
| GET | `/api/listings/:id` | Оголошення з авто й аналізами |
| PATCH | `/api/listings/:id` | Оновити ціну/пробіг |
| DELETE | `/api/listings/:id` | Видалити |
| POST | `/api/listings/:id/analyses` | Запустити аналіз (ставить задачу в чергу BullMQ) |
| GET | `/api/analyses/:id` | Аналіз з прапорцями ризиків |
| GET | `/api/analyses/:id/events` | SSE: стан аналізу в реальному часі, закривається на `done`/`failed` |

## Аналіз

Аналіз виконує BullMQ-воркер (`apps/api/src/analyses/analysis.processor.ts`) по кроках з
`ANALYSIS_STEPS` (`packages/shared`). Після кожного кроку воркер пише прогрес у БД, а SSE-ендпоінт
віддає оновлений стан клієнту. Для роботи потрібен Redis (`pnpm infra:up`).

Кроки:

1. **Завантажуємо оголошення** — `listing-parser.ts` дістає з JSON-LD сторінки опис, VIN, пробіг, ціну й фото.
2. **Перевіряємо VIN** — формат і відповідність оголошенню.
3. **AI аналізує опис і фото** — `car-analyst.service.ts` надсилає опис і до 8 фото в Claude (`claude-opus-5-5`)
   і отримує structured output: дефекти, прив'язані до зон авто, оцінку ризику, справедливу ціну
   й фрази для торгу.
4. **Формуємо звіт** — звіт зберігається в `analyses.result`, знахідки — в `risk_flags`.

Для AI-аналізу задай ключ Anthropic у `.env`:

```
LLM_API_KEY=sk-ant-...
```

Без ключа звіт будується в **демо-режимі**: загальний чек-лист огляду з чіткою позначкою «демо»,
щоб можна було подивитися UI.

Усі ендпоінти, крім `health`, `register` і `login`, потребують `Authorization: Bearer <token>`.

## Міграції

Схемою керують міграції в `apps/api/db/migrations` (`synchronize` вимкнено).

```bash
pnpm db:migrate
pnpm db:migrate:undo
pnpm --filter @carintel/api db:migration:new add-something
```

## Дорожня карта MVP

1. ✅ Монорепо, Docker, auth, CRUD оголошень, схема БД
2. 🔄 ✅ BullMQ-воркер і SSE-прогрес · ⏳ парсинг оголошення за URL, фото в S3, vision-аналіз
3. ⏳ Ринкова ціна (market snapshots), звіт
4. ⏳ RAG по базі знань (pgvector), structured output
5. ⏳ Асистент для торгу, полірування

## 3D-шоурум

Звіт показує авто в 3D-сцені (Three.js + React Three Fiber + camera-controls): його можна
крутити на 360°, наближати, а точки дефектів прив'язані до реальних деталей моделі
(`apps/web/src/components/car3d`). Колір кузова береться з оголошення.

3D-модель: [«Car Concept»](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept)
© The Khronos Group, ліцензія [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Логотип Khronos у моделі прихований.
