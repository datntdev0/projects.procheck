import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

/** Local date as YYYY-MM-DD, matching the app's daily log file name. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}


test('settings page shows the in-page navigation and its sections', async ({ ui }) => {
  const { settings } = ui;

  await test.step('opens from the sidebar', async () => {
    await settings.open();
    await expect(settings.nav).toBeVisible();
  });

  await test.step('every nav item has a section', async () => {
    for (const section of ['about', 'general', 'diagnostics', 'storage', 'agents'] as const) {
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
  for (const entry of ['settings', 'projects', 'logs', 'cli', 'chats', 'cache']) {
    await expect(storage.getByTestId(`storage-item-${entry}`)).toBeVisible();
  }
  await expect(storage.getByTestId('storage-item-logs')).toContainText('logs\\');
  await expect(storage.getByTestId('storage-project-zone')).toContainText('procheck.json');

  const about = settings.section('about');
  await expect(about.getByTestId('about-settings-file')).toHaveText(path.join(sandbox.dataDir, 'settings.json'));
  await expect(about.getByTestId('about-registry-file')).toHaveText(path.join(sandbox.dataDir, 'projects.json'));
});

test('general settings are saved to settings.json and survive a restart', async ({ app, ui, sandbox }) => {
  const settingsPath = path.join(sandbox.dataDir, 'settings.json');
  const readSettings = (): SettingsFile => JSON.parse(readFileSync(settingsPath, 'utf8')) as SettingsFile;
  const { settings } = ui;

  await test.step('first start writes the defaults', async () => {
    expect(readSettings()).toEqual({
      version: 1,
      general: { theme: 'system', language: 'en', defaultProjectDir: null, onStartup: 'lastProject' },
      diagnostics: { logLevel: 'info', logRetentionDays: 14 },
      agents: {
        defaultAgent: 'claude',
        claude: { binPath: null, model: null },
        codex: { binPath: null, model: null },
      },
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

test('diagnostics: log file, level and retention', async ({ app, ui, sandbox }) => {
  const logsDir = path.join(sandbox.dataDir, 'logs');
  const logFile = path.join(logsDir, `procheck-${today()}.log`);
  const readLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');
  const readSettings = () => JSON.parse(readFileSync(path.join(sandbox.dataDir, 'settings.json'), 'utf8')) as {
    diagnostics: { logLevel: string; logRetentionDays: number };
  };
  const { settings } = ui;

  await test.step('startup is written to today’s log file', async () => {
    await expect.poll(readLog).toContain('starting, data directory');
  });

  await test.step('the section shows the logs folder and the defaults', async () => {
    await settings.open();
    await expect(settings.logsSummary).toContainText(logsDir);
    await expect(settings.logLevel).toHaveValue('info');
    await expect(settings.logRetention).toHaveValue('14');
  });

  await test.step('level and retention are saved; debug applies right away', async () => {
    await settings.logLevel.selectOption('debug');
    await settings.logRetention.selectOption('7');
    await settings.saveButton.click();
    await expect(settings.saveBar).toBeHidden();
    expect(readSettings().diagnostics).toEqual({ logLevel: 'debug', logRetentionDays: 7 });
    await expect.poll(readLog).toContain('settings saved');

    // The next save is recorded at debug level.
    await settings.logRetention.selectOption('30');
    await settings.saveButton.click();
    await expect.poll(readLog).toContain('DEBUG [procheck::features::settings] settings:');
  });

  await test.step('records sent by the UI land in the same file', async () => {
    await app.page.evaluate(() =>
      (window as unknown as { __TAURI_INTERNALS__: { invoke(cmd: string, args: unknown): Promise<void> } }).__TAURI_INTERNALS__.invoke(
        'diagnostics_log',
        { level: 'warn', message: 'hello from the ui' },
      ),
    );
    await expect.poll(readLog).toContain('WARN  [ui] hello from the ui');
  });

  await test.step('log files older than the retention period are deleted at startup', async () => {
    const old = path.join(logsDir, 'procheck-2020-01-01.log');
    writeFileSync(old, 'old');
    await app.restart();
    await expect(ui.shell.root).toBeVisible();
    expect(existsSync(old)).toBe(false);
    expect(existsSync(logFile)).toBe(true);
  });
});
