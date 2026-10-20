import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const pathsToClean = [
  'artifacts/request-logs',
  'artifacts/discovery',
  'bdd-results',
  'custom-report',
  'test-results',
  'playwright-report',
  'allure-results/bdd',
  'allure-results/non-bdd',
];

for (const relativePath of pathsToClean) {
  const target = path.resolve(process.cwd(), relativePath);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
}
