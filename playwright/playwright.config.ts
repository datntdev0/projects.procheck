import path from 'node:path';

import { defineConfig } from '@playwright/test';

import { outputRoot } from './scripts/paths.ts';

export default defineConfig({
  outputDir: path.join(outputRoot, 'results'),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: path.join(outputRoot, 'report'), open: 'never' }]],
  projects: [{ name: 'desktop', testDir: 'desktop' }],
});
