import { defineConfig } from '@playwright/test';

import { loadEnvironmentConfig } from './src/config/env';

const environment = loadEnvironmentConfig();

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
    ['allure-playwright', { outputFolder: 'allure-results/non-bdd' }],
  ],
  use: {
    baseURL: environment.baseURL,
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  },
});
