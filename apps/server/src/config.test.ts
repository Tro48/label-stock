import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const SECRET_URL = 'postgres://user:S3cr3tPa55@db:5432/labels';

describe('loadConfig', () => {
  it('подставляет дефолты', () => {
    expect(loadConfig({ DATABASE_URL: SECRET_URL })).toEqual({
      databaseUrl: SECRET_URL,
      host: '0.0.0.0',
      port: 3000,
      logLevel: 'info',
      dbPoolMax: 10,
      dbStatementTimeoutMs: 10_000,
      dbConnectRetries: 30,
      dbConnectRetryDelayMs: 2_000,
      rateLimitMaxPerMinute: 600,
      staticDir: undefined,
    });
  });

  it('приводит числа из строк окружения', () => {
    const config = loadConfig({
      DATABASE_URL: SECRET_URL,
      PORT: '8080',
      DB_POOL_MAX: '5',
      DB_CONNECT_RETRIES: '0',
      RATE_LIMIT_MAX_PER_MINUTE: '1',
      LOG_LEVEL: 'silent',
      STATIC_DIR: '/app/web',
    });
    expect(config).toMatchObject({
      port: 8080,
      dbPoolMax: 5,
      dbConnectRetries: 0,
      rateLimitMaxPerMinute: 1,
      logLevel: 'silent',
      staticDir: '/app/web',
    });
  });

  it('пустой STATIC_DIR — статика не раздаётся', () => {
    expect(loadConfig({ DATABASE_URL: SECRET_URL, STATIC_DIR: '' }).staticDir).toBeUndefined();
  });

  it.each([
    ['DATABASE_URL отсутствует', {}],
    ['DATABASE_URL пустой', { DATABASE_URL: '' }],
  ])('%s → ошибка', (_name, env) => {
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', '80.5'],
    ['DB_POOL_MAX', '0'],
    ['DB_STATEMENT_TIMEOUT_MS', '99'],
    ['DB_CONNECT_RETRIES', '-1'],
    ['RATE_LIMIT_MAX_PER_MINUTE', '0'],
    ['LOG_LEVEL', 'verbose'],
  ])('%s=%s → ошибка с именем переменной', (name, value) => {
    expect(() => loadConfig({ DATABASE_URL: SECRET_URL, [name]: value })).toThrow(name);
  });

  it('в тексте ошибки нет значения DATABASE_URL с паролем', () => {
    let message = '';
    try {
      loadConfig({ DATABASE_URL: SECRET_URL, PORT: 'abc', LOG_LEVEL: 'verbose' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('PORT');
    expect(message).not.toContain('S3cr3tPa55');
    expect(message).not.toContain(SECRET_URL);
  });
});
