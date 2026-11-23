import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';

interface SettingsFile {
  version: number;
  general: {
    theme: string;
    language: string;
    defaultProjectDir: string | null;
    onStartup: string;
  };
}

test('general settings are saved to settings.json and survive a restart', async ({ app, ui, sandbox }) => {
  const settingsPath = path.join(sandbox.dataDir, 'settings.json');
  const readSettings = (): SettingsFile => JSON.parse(readFileSync(settingsPath, 'utf8')) as SettingsFile;
  const { settings } = ui;

  await test.step('first start writes the defaults', async () => {
    expect(readSettings()).toEqual({
      version: 1,
      general: { theme: 'system', language: 'en', defaultProjectDir: null, onStartup: 'lastProject' },
      diagnostics: { logLevel: 'info', logRetentionDays: 14 },
    });
    await settings.open();
    await expect(settings.settingsFile).toHaveText(settingsPath);
    await expect(settings.saveBar).toBeHidden();
  });

  await test.step('theme applies and is saved immediately', async () => {
    await settings.theme.getByRole('radio', { name: 'Dark' }).click();
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => readSettings().general.theme).toBe('dark');
    await expect(settings.saveBar).toBeHidden();
  });

  await test.step('a folder that does not exist is rejected', async () => {
    await settings.defaultProjectDir.fill(path.join(sandbox.root, 'missing'));
    await expect(settings.saveBar).toBeVisible();
    await settings.saveButton.click();
    await expect(settings.defaultProjectDir).toHaveAttribute('aria-invalid', 'true');
    expect(readSettings().general.defaultProjectDir).toBeNull();
  });

  await test.step('discard restores the saved values', async () => {
    await settings.discardButton.click();
    await expect(settings.defaultProjectDir).toHaveValue('');
    await expect(settings.saveBar).toBeHidden();
  });

  await test.step('folder and startup view are saved from the save bar', async () => {
    await settings.defaultProjectDir.fill(sandbox.root);
    await settings.onStartup.selectOption('allProjects');
    await settings.saveButton.click();
    await expect(settings.saveBar).toBeHidden();
    expect(readSettings().general).toMatchObject({ defaultProjectDir: sandbox.root, onStartup: 'allProjects' });
  });

  await test.step('language from the topbar is saved too', async () => {
    await app.page.getByTestId('language-button').click();
    await expect.poll(() => readSettings().general.language).toBe('vi');
  });

  await test.step('everything is restored after a restart', async () => {
    await app.restart();
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(app.page.locator('html')).toHaveAttribute('lang', 'vi');
    await ui.settings.open();
    await expect(ui.settings.defaultProjectDir).toHaveValue(sandbox.root);
    await expect(ui.settings.onStartup).toHaveValue('allProjects');
    await expect(ui.settings.theme.getByRole('radio', { checked: true })).toHaveText(/Tối/);
  });
});
