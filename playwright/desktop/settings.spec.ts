import path from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';

test('settings page shows the in-page navigation and its sections', async ({ ui }) => {
  const { settings } = ui;

  await test.step('opens from the sidebar', async () => {
    await settings.open();
    await expect(settings.nav).toBeVisible();
  });

  await test.step('every nav item has a section', async () => {
    for (const section of ['about', 'general', 'diagnostics', 'storage'] as const) {
      await expect(settings.navItem(section)).toBeVisible();
      await expect(settings.section(section)).toBeAttached();
    }
    await expect(settings.navItem('about')).toHaveAttribute('aria-current', 'true');
  });

  await test.step('clicking a nav item scrolls to its section', async () => {
    await settings.navItem('storage').click();
    await expect(settings.navItem('storage')).toHaveAttribute('aria-current', 'true');
    await expect(settings.section('storage')).toBeInViewport();
  });
});

test('about shows the version and always reports up to date', async ({ ui, app }) => {
  const { settings } = ui;
  await settings.open();

  const about = settings.section('about');
  await expect(about.getByTestId('about-version')).toHaveText('0.0.0');

  await about.getByTestId('check-update').click();
  await expect(about.getByTestId('update-status')).toContainText('You are up to date');
  await expect(app.page.getByRole('status').filter({ hasText: 'You are up to date' }).first()).toBeVisible();
});

test('storage lists the application data directory', async ({ ui, sandbox }) => {
  const { settings } = ui;
  await settings.open();

  const storage = settings.section('storage');
  await expect(storage.getByTestId('storage-root')).toHaveText(sandbox.dataDir);
  for (const entry of ['settings', 'projects', 'logs', 'cache']) {
    await expect(storage.getByTestId(`storage-item-${entry}`)).toBeVisible();
  }
  await expect(storage.getByTestId('storage-item-logs')).toContainText('logs\\');
  await expect(storage.getByTestId('storage-project-zone')).toContainText('procheck.json');

  const about = settings.section('about');
  await expect(about.getByTestId('about-settings-file')).toHaveText(path.join(sandbox.dataDir, 'settings.json'));
  await expect(about.getByTestId('about-registry-file')).toHaveText(path.join(sandbox.dataDir, 'projects.json'));
});
