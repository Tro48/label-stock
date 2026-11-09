import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL не задан'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
  DB_CONNECT_RETRIES: z.coerce.number().int().min(0).default(30),
  DB_CONNECT_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(2_000),
  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(600),
  // Каталог собранного фронта. Пустой — статика не раздаётся (режим разработки через Vite).
  STATIC_DIR: z.string().optional(),
});

export interface AppConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: z.infer<typeof configSchema>['LOG_LEVEL'];
  dbPoolMax: number;
  dbStatementTimeoutMs: number;
  dbConnectRetries: number;
  dbConnectRetryDelayMs: number;
  rateLimitMaxPerMinute: number;
  staticDir: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    // Значения переменных не выводим: в DATABASE_URL лежит пароль.
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Некорректная конфигурация окружения:\n${problems.join('\n')}`);
  }
  const parsed = result.data;
  return {
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    dbPoolMax: parsed.DB_POOL_MAX,
    dbStatementTimeoutMs: parsed.DB_STATEMENT_TIMEOUT_MS,
    dbConnectRetries: parsed.DB_CONNECT_RETRIES,
    dbConnectRetryDelayMs: parsed.DB_CONNECT_RETRY_DELAY_MS,
    rateLimitMaxPerMinute: parsed.RATE_LIMIT_MAX_PER_MINUTE,
    staticDir: parsed.STATIC_DIR || undefined,
  };
}
