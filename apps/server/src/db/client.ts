import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
/** Транзакция Drizzle: те же методы, что у Database. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbExecutor = Database | Transaction;

export interface PoolOptions {
  connectionString: string;
  max: number;
  statementTimeoutMs: number;
}

export function createPool({ connectionString, max, statementTimeoutMs }: PoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString,
    max,
    statement_timeout: statementTimeoutMs,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}

export async function runMigrations(database: Database, migrationsFolder: string): Promise<void> {
  await migrate(database, { migrationsFolder });
}
