import { defineConfig, devices } from '@playwright/test';

// Тесты идут против уже запущенного приложения (docker compose или pnpm dev:server + сборка фронта).
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
