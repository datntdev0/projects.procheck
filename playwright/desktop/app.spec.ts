import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';

test('app starts with file-based storage and survives a restart', async ({ app, ui, sandbox }) => {
  await test.step('main layout shows app name, version and the projects hero', async () => {
    await expect(ui.shell.root).toBeVisible();
    await expect(ui.shell.appName).toHaveText('Procheck');
    await expect(ui.shell.appVersion).toHaveText('0.0.0');
    await expect(ui.shell.projectsHero).toBeVisible();
  });

  await test.step('data directory holds plain files and folders, no database', async () => {
    expect(existsSync(path.join(sandbox.dataDir, 'logs'))).toBe(true);
    expect(existsSync(path.join(sandbox.dataDir, 'cache'))).toBe(true);
    expect(readdirSync(sandbox.dataDir).filter((name) => name.endsWith('.sqlite'))).toEqual([]);
  });

  await test.step('app restarts on the same data directory', async () => {
    await app.restart();
    await expect(ui.shell.root).toBeVisible();
    await expect(ui.shell.appVersion).toHaveText('0.0.0');
  });
});
