import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Playwright Test Configuration for PayFlow.
 * Configures browser settings, webServer lifecycle, reporters, and isolation.
 */
const PORT = process.env.PORT || '3000';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const TEST_DB_PATH = path.resolve(process.cwd(), 'data', 'payflow.test.db');
const TEST_API_KEY = process.env.API_KEY || 'test_api_key_playwright_2026';

export default defineConfig({
  testDir: './src/test/playwright',
  fullyParallel: false, // Sequential worker to guarantee deterministic SQLite access without file contention
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Automatically boot the Express application before tests begin */
  webServer: {
    command: 'npm start',
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      PORT,
      DATABASE_PATH: TEST_DB_PATH,
      API_KEY: TEST_API_KEY,
    },
  },
});
