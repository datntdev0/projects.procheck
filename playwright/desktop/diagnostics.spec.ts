import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';

/** Local date as YYYY-MM-DD, matching the app's daily log file name. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

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
