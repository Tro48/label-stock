import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp, LOG_REDACT_PATHS } from '../src/app';
import { createPool } from '../src/db/client';

const SECRET = 'super-secret-password';

async function captureLogs(log: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<void>) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const pool = createPool({
    connectionString: `postgres://user:${SECRET}@127.0.0.1:1/db`,
    max: 1,
    statementTimeoutMs: 1_000,
  });
  const app = await buildApp({
    pool,
    logger: { level: 'info', redact: LOG_REDACT_PATHS, stream },
    rateLimitMaxPerMinute: 1_000,
  });
  try {
    await log(app);
  } finally {
    await app.close();
    await pool.end();
  }
  return lines.join('');
}

describe('redact в логах', () => {
  it('скрывает строку подключения и пароль на верхнем и вложенном уровне', async () => {
    const output = await captureLogs(async (app) => {
      app.log.info({ databaseUrl: `postgres://u:${SECRET}@h/db` }, 'конфиг');
      app.log.info({ config: { connectionString: SECRET, password: SECRET } }, 'вложенный');
    });
    expect(output).not.toContain(SECRET);
    expect(output).toContain('[Redacted]');
  });

  it('скрывает заголовок Authorization в логе запроса', async () => {
    const output = await captureLogs(async (app) => {
      await app.inject({ url: '/api/unknown', headers: { authorization: `Bearer ${SECRET}` } });
    });
    expect(output).toContain('incoming request');
    expect(output).not.toContain(SECRET);
  });

  it('не пишет пароль из строки подключения, когда БД недоступна', async () => {
    const output = await captureLogs(async (app) => {
      await app.inject({ url: '/api/labels' });
      await app.inject({ url: '/api/health' });
    });
    expect(output).not.toContain(SECRET);
  });
});
