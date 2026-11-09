// Сервер собирается в один файл вместе с @label-stock/shared (он поставляется исходниками на TS).
// Остальные зависимости остаются внешними: @fastify/swagger-ui читает статику из своего пакета.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const { dependencies } = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
const external = Object.keys(dependencies).filter((name) => name !== '@label-stock/shared');

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
});
