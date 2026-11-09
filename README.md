# Учёт остатков этикетки

Веб-приложение для локальной сети: таблица остатков, сканер штрихкодов, журнал движений, выгрузка и загрузка CSV для Excel, светлая и тёмная тема. План и принятые решения — в [PLAN.md](PLAN.md), инструкция для пользователей — в [docs/user-guide.md](docs/user-guide.md).

## Структура

- `packages/shared` — zod-схемы, DTO, нормализация штрихкода (общие для клиента и сервера);
- `apps/server` — Fastify + Drizzle + PostgreSQL 17, Swagger UI на `/api/docs`;
- `apps/web` — React + Vite + TanStack Query;
- `e2e` — Playwright + axe;
- `deploy` — Docker Compose, Dockerfile, бэкап.

## Разработка

Нужны Node.js 22, pnpm 10, Docker.

```sh
pnpm install
docker run -d --name label-stock-dev -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17-alpine
echo 'DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres' > .env
pnpm dev:server   # API на :3000, миграции применяются при старте
pnpm dev:web      # фронт на :5173, /api проксируется на :3000
```

Проверки (критерий готовности этапа):

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
E2E_BASE_URL=http://localhost:8080 pnpm e2e   # против запущенного приложения
```

Тесты сервера сами поднимают PostgreSQL через Testcontainers, нужен запущенный Docker.

Миграции: поменять `apps/server/src/db/schema.ts`, затем `pnpm --filter @label-stock/server db:generate --name <что-изменилось>`.

## Загрузка из CSV

`POST /api/import.csv` (тело — сам CSV, `Content-Type: text/csv`), `?dryRun=true` — только проверить. Формат как у `GET /api/export.csv`. Загрузка атомарная: при любой ошибке строки ничего не записывается, ответ содержит ошибки по номерам строк. Подробности для пользователей — в `docs/user-guide.md`.

## Обновление на сервере

Репозиторий публичный, клонируется без авторизации:

```sh
git clone https://github.com/Tro48/label-stock.git /opt/label-stock   # первый раз
cd /opt/label-stock && git pull && docker compose -f deploy/docker-compose.yml up -d --build
```

Миграции применяются при старте, данные в томе `postgres-data` сохраняются.

## Деплой на сервер

```sh
cp deploy/.env.example deploy/.env    # задать POSTGRES_PASSWORD
docker compose -f deploy/docker-compose.yml up -d --build
```

Приложение откроется на `http://<сервер>:8080` (порт задаётся `APP_PORT`). Порт PostgreSQL наружу не открыт. Логи — `docker compose -f deploy/docker-compose.yml logs -f app`, ротация 5 × 10 МБ.

Переменные окружения приложения: `DATABASE_URL`, `PORT`, `HOST`, `LOG_LEVEL`, `DB_POOL_MAX` (10), `DB_STATEMENT_TIMEOUT_MS` (10000), `DB_CONNECT_RETRIES` (30), `DB_CONNECT_RETRY_DELAY_MS` (2000), `RATE_LIMIT_MAX_PER_MINUTE` (600), `STATIC_DIR`. Порог сканера задаётся при сборке фронта: `VITE_SCANNER_MAX_INTERVAL_MS` (35), `VITE_SCANNER_MIN_LENGTH` (6).

### Бэкапы

`deploy/backup.sh` делает `pg_dump -Fc`, хранит 14 копий и при заданном `OFFSITE_DIR` кладёт копию на другой диск или в сетевую папку. Cron:

```
15 3 * * * BACKUP_DIR=/var/backups/label-stock OFFSITE_DIR=/mnt/nas/label-stock /opt/label-stock/deploy/backup.sh >> /var/log/label-stock-backup.log 2>&1
```

Восстановление (один раз проверить вручную при деплое):

```sh
docker compose -f deploy/docker-compose.yml stop app
docker compose -f deploy/docker-compose.yml exec -T postgres \
  pg_restore -U label_stock -d label_stock --clean --if-exists < /var/backups/label-stock/label-stock_<дата>.dump
docker compose -f deploy/docker-compose.yml start app
```

### Защита

Входа нет: менять данные может любой, у кого есть доступ к адресу в локальной сети. Компенсируют это мягкое удаление с восстановлением и журнал всех изменений остатка. Если понадобится пароль, проще всего поставить перед приложением Caddy с `basicauth`.
