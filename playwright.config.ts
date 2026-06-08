import { defineConfig, devices } from '@playwright/test';

/**
 * Конфигурация e2e-тестов.
 *
 * Тесты гоняются против dev-сервера Vite (на нём доступны dev-хуки
 * window.__exportPdfBytes / __exportScenesBytes для проверки экспорта).
 * Фиксированный порт 5180 + strictPort, чтобы baseURL был стабильным.
 */
const PORT = 5180;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
