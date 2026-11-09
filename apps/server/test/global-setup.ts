import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { fileURLToPath } from 'node:url';
import { createDatabase, createPool, runMigrations } from '../src/db/client';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const databaseUrl = container.getConnectionUri();
  const pool = createPool({ connectionString: databaseUrl, max: 2, statementTimeoutMs: 10_000 });
  try {
    await runMigrations(createDatabase(pool), MIGRATIONS_DIR);
  } finally {
    await pool.end();
  }
  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
