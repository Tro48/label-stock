import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Все файлы делят один контейнер PostgreSQL и чистят таблицы перед тестом.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
