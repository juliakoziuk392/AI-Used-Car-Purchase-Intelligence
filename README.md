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

API працює без глобального префікса: маршрути починаються одразу з `/auth`, `/listings` тощо.
Web-клієнт ходить на `/api/...`, а Vite-проксі відрізає `/api` і передає запит на `http://localhost:3000`
(у продакшені так само має робити reverse proxy, напр. nginx `location /api/ { proxy_pass http://api:3000/; }`).

## API

Swagger UI: `http://localhost:3000/docs` (кнопка **Authorize** — встав `accessToken` з логіну).
У продакшені (`NODE_ENV=production`) документацію вимкнено, якщо не задано `SWAGGER_ENABLED=true`.

| Метод | Шлях | Опис |
| --- | --- | --- |
| GET | `/health` | Стан API та БД |
| POST | `/auth/register` | Реєстрація → `{ accessToken, user }` |
| POST | `/auth/login` | Логін → `{ accessToken, user }` |
| GET | `/auth/me` | Поточний користувач |
| GET | `/listings` | Оголошення користувача |
| POST | `/listings` | Створити оголошення за посиланням auto.ria: авто, ціна й пробіг дістаються зі сторінки |
| GET | `/listings/:id` | Оголошення з авто й аналізами |
| DELETE | `/listings/:id` | Видалити |
| POST | `/listings/:id/analyses` | Запустити аналіз (ставить задачу в чергу BullMQ) |
| GET | `/analyses/:id` | Аналіз з прапорцями ризиків |
| GET | `/analyses/:id/model.glb` | 3D-модель авто, згенерована з фото |
| POST | `/analyses/:id/model3d` | Згенерувати 3D-модель ще раз: задача в черзі, `202`, прогрес через SSE |
| GET | `/analyses/:id/events` | SSE: стан аналізу й генерації 3D, закривається на `done`/`failed`, коли 3D не генерується |

### Захист

- **Лише auto.ria.** Сервер завантажує тільки сторінки `auto.ria.com` (і редиректи теж перевіряються),
  щоб поле URL не можна було використати для запитів у внутрішню мережу (SSRF).
- **Rate limit** (`@nestjs/throttler`, на IP): 120 запитів/хв загалом, 10/хв на `register` і `login`,
  3 за 10 хв на повторну генерацію 3D. За reverse proxy задай `TRUST_PROXY=true`, щоб ліміт рахувався по IP клієнта.
- **Денний ліміт аналізів** на користувача — `ANALYSES_DAILY_LIMIT` (за замовчуванням 20), далі `429`.
- **Повтори.** Аналіз, що впав (напр. збій LLM), повторюється ще двічі — через 30 с і 60 с; `failed` лише після третьої спроби.
- **helmet** додає захисні HTTP-заголовки; тіло JSON обмежене стандартними для Express 100 КБ.
- **Перевірка `.env` при старті** (`apps/api/src/config/env.ts`): з неправильним конфігом API не запуститься,
  а в продакшені — і зі стандартним `JWT_SECRET` з `.env.example`.

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

## Деплой на Render

Безкоштовно і без картки: **Render** (один веб-сервіс з API і фронтом + Redis) і **Supabase** (Postgres з pgvector + S3-сховище).
`Dockerfile` збирає фронт і API в один образ; API віддає фронт з `WEB_DIST_DIR`, а `/api/*` обробляє без префікса,
як Vite-проксі локально. Міграції запускаються при кожному старті контейнера.

1. **Supabase** ([supabase.com](https://supabase.com), регіон Frankfurt) → новий проєкт, запам'ятай пароль БД.
   - **Connect → Session pooler**: звідти `DB_HOST` (`aws-…pooler.supabase.com`), `DB_USERNAME` (`postgres.<ref>`) і пароль.
     Прямий хост `db.<ref>.supabase.co` працює лише по IPv6 — Render до нього не дістає.
   - **Storage → New bucket** `carintel-photos` (приватний). **Storage → Settings → S3 Connection**:
     `S3_ENDPOINT` (`https://<ref>.storage.supabase.co/storage/v1/s3`), `S3_REGION`, і там же створи access key → `S3_ACCESS_KEY` / `S3_SECRET_KEY`.
2. **Render** ([render.com](https://render.com)) → **New → Blueprint** → цей репозиторій. Render прочитає `render.yaml`,
   створить сервіс `carintel` і Redis `carintel-redis` та попросить значення з `sync: false`:
   дані Supabase з кроку 1, `GEMINI_API_KEY`, `HF_TOKEN` (можна порожнім) і `WEB_ORIGIN` — адресу сайту
   (свій домен; фронт і API на одній адресі, тож CORS тут не заважає). `JWT_SECRET` Render згенерує сам.
3. **Свій домен:** сервіс → **Settings → Custom Domains** → додай домен і створи в DNS запис, який покаже Render
   (CNAME на адресу `….onrender.com` сервісу для піддомену, A-запис `216.24.57.1` для кореневого домену).

Обмеження безкоштовного плану: сервіс засинає після 15 хв без запитів (перше відкриття ~1 хв),
Redis без збереження на диск (при перезапуску черга очищується), Supabase ставить проєкт на паузу після 7 днів без запитів.

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

### 3D саме цього авто

Під час аналізу TRELLIS (Hugging Face) будує GLB-модель з фото оголошення
(`apps/api/src/analyses/model3d.service.ts`). Модель зберігається в S3 (`models/<analysisId>.glb`,
локально — MinIO з `pnpm infra:up`), а не на диску, тож переживає перезапуск контейнера.
Офіційний образ `minio/minio` більше не публікується, тому docker-compose бере збірку Chainguard
`cgr.dev/chainguard/minio`; консоль MinIO — `http://localhost:9001` (логін/пароль — `S3_ACCESS_KEY`/`S3_SECRET_KEY`).
GLB-файли, що лишились у `apps/api/storage/models` від старих версій, переносяться в S3 при першому відкритті.
Коли оголошення видаляють, його моделі прибираються зі сховища.

Якщо 3D не вдалась (напр. скінчилась квота GPU), кнопка «Згенерувати 3D» викликає
`POST /analyses/:id/model3d`: він ставить задачу `model3d` у ту саму чергу BullMQ і одразу відповідає `202`.
Прогрес (`result.model3d`: `status: 'generating'`, `progress`, `stage`) приходить через той самий
SSE-стрім, який лишається відкритим, доки генерація не завершиться. Воркер виконує до 2 задач паралельно,
тож генерація 3D не блокує нові аналізи. Якщо задача загубилась (напр. очистили Redis), через 15 хв
генерацію можна запустити знову.

Без доступного S3 API все одно стартує (з попередженням у лозі) — не працюватиме лише збереження 3D.

3D-модель: [«Car Concept»](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept)
© The Khronos Group, ліцензія [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Логотип Khronos у моделі прихований.
