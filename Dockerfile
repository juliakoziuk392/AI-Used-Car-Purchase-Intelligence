# Продакшн-образ для Render: один контейнер віддає і API, і зібраний фронт (див. README → «Деплой на Render»).
FROM node:22-alpine AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app
# Маніфести окремо від коду — шар із залежностями кешується, поки не змінився lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @carintel/shared build \
  && pnpm --filter @carintel/web build \
  && pnpm --filter @carintel/api build

FROM base AS runtime
# Лише залежності API (з dev — заради sequelize-cli для міграцій); vite, three тощо в образ не потрапляють.
# NODE_ENV задаємо після install: з NODE_ENV=production pnpm пропускає devDependencies.
RUN pnpm install --frozen-lockfile --filter @carintel/api...
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY apps/api/db apps/api/db
COPY apps/api/.sequelizerc apps/api/
ENV WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app/apps/api
# На безкоштовному Render нема pre-deploy команди, тож міграції йдуть перед стартом API.
CMD ["sh", "-c", "pnpm db:migrate && node dist/main.js"]
