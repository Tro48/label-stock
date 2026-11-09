import { fileURLToPath } from 'node:url';
import { buildApp, LOG_REDACT_PATHS } from './app';
import { loadConfig } from './config';
import { createDatabase, createPool, runMigrations } from './db/client';
import { waitForDatabase } from './db/connect-with-retry';

// main.ts в исходниках и dist/main.js в сборке лежат на одной глубине от каталога миграций.
const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    statementTimeoutMs: config.dbStatementTimeoutMs,
  });

  const app = await buildApp({
    pool,
    logger: { level: config.logLevel, redact: LOG_REDACT_PATHS },
    rateLimitMaxPerMinute: config.rateLimitMaxPerMinute,
    staticDir: config.staticDir,
  });
  // Ошибка простаивающего соединения (рестарт PostgreSQL) иначе роняет процесс.
  pool.on('error', (error) => app.log.error({ err: error }, 'Ошибка соединения в пуле PostgreSQL'));
  app.addHook('onClose', () => pool.end());

  let shuttingDown = false;
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info(`Получен ${signal}, останавливаемся`);
      app.close().then(
        () => process.exit(0),
        (error: unknown) => {
          app.log.error({ err: error }, 'Ошибка при остановке');
          process.exit(1);
        },
      );
    });
  }

  await waitForDatabase(pool, {
    retries: config.dbConnectRetries,
    delayMs: config.dbConnectRetryDelayMs,
    logger: app.log,
  });
  await runMigrations(createDatabase(pool), MIGRATIONS_DIR);
  app.log.info('Миграции применены');

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
