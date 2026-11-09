// Создаёт базу приложения во встроенном PostgreSQL, если её ещё нет. В сборке PostgreSQL нет psql,
// поэтому используем драйвер pg из зависимостей сервера. Запуск: node --env-file=.env create-database.mjs
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/server/package.json', import.meta.url));
const { Client } = require('pg');

const appUrl = new URL(process.env.DATABASE_URL ?? '');
const databaseName = decodeURIComponent(appUrl.pathname.slice(1));
if (!databaseName) throw new Error('В DATABASE_URL не указано имя базы');

// Служебная база postgres есть в любом кластере сразу после initdb.
const maintenanceUrl = new URL(appUrl);
maintenanceUrl.pathname = '/postgres';

const client = new Client({ connectionString: maintenanceUrl.toString() });
await client.connect();
try {
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    databaseName,
  ]);
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(databaseName)}`);
    console.log(`База ${databaseName} создана`);
  }
} finally {
  await client.end();
}
