# Сборка из корня репозитория: docker compose -f deploy/docker-compose.yml build
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Только продакшен-зависимости сервера, без dev-пакетов и исходников.
RUN pnpm --filter @label-stock/server deploy --prod --legacy /prod/server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=build /prod/server/node_modules ./node_modules
COPY --from=build /prod/server/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
