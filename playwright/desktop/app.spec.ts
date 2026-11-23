import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test } from '../scripts/fixtures.ts';

interface MigrationRow {
  version: string;
  seq: number;
}

function readMigrationHistory(databaseFile: string): MigrationRow[] {
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    return db
      .prepare('SELECT version, seq FROM sys_migration_history ORDER BY version, seq')
      .all() as unknown as MigrationRow[];
  } finally {
    db.close();
  }
}

test('app starts, migrates the database and survives a restart', async ({ app, ui, sandbox }) => {
  const databaseFile = path.join(sandbox.dataDir, 'application.sqlite');

  await test.step('welcome screen shows app name and version', async () => {
    await expect(ui.welcome.root).toBeVisible();
    await expect(ui.welcome.title).toHaveText('Procheck');
    await expect(ui.welcome.version).toHaveText('0.0.0');
  });

  await test.step('database is created with one migration history row', async () => {
    expect(existsSync(databaseFile)).toBe(true);
    expect(readMigrationHistory(databaseFile)).toEqual([{ version: '0.0.0', seq: 0 }]);
  });

  await test.step('app restarts without re-running migrations', async () => {
    await app.restart();
    await expect(ui.welcome.root).toBeVisible();
    await expect(ui.welcome.version).toHaveText('0.0.0');
    expect(readMigrationHistory(databaseFile)).toEqual([{ version: '0.0.0', seq: 0 }]);
  });
});
