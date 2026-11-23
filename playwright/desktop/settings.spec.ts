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
