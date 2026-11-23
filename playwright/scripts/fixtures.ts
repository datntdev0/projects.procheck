import { test as base } from '@playwright/test';

import { ShellPage } from '../pages/shell.ts';
import { AppSession } from './app.ts';
import { type Sandbox, createSandbox } from './sandbox.ts';

export interface Ui {
  shell: ShellPage;
}

interface Fixtures {
  sandbox: Sandbox;
  app: AppSession;
  ui: Ui;
}

export const test = base.extend<Fixtures>({
  sandbox: async ({}, use) => {
    const sandbox = createSandbox();
    await use(sandbox);
    await sandbox.dispose();
  },

  app: async ({ sandbox }, use, testInfo) => {
    const app = new AppSession(sandbox);
    await app.start();
    try {
      await use(app);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus && app.running) {
        const screenshot = await app.page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach('failure-screenshot', { body: screenshot, contentType: 'image/png' });
        }
      }
      await app.stop();
    }
  },

  ui: async ({ app }, use) => {
    // Page objects are resolved lazily so they follow app.restart().
    await use({
      get shell() {
        return new ShellPage(app.page);
      },
    });
  },
});

export { expect } from '@playwright/test';
