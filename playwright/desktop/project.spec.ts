import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';
import type { Sandbox } from '../scripts/sandbox.ts';

const PROJECT_ID = '6f1c2b1e-3d4a-4c5b-9e8f-0a1b2c3d4e5f';

interface Manifest {
  id: string;
  name: string;
  code: string | null;
  client: string | null;
  description: string | null;
  repository: string | null;
}

interface Registry {
  projects: { id: string; dir: string }[];
}

/** Writes a project directory and registers it in `projects.json`; returns the project directory. */
function seedProject(sandbox: Sandbox): string {
  const dir = path.join(sandbox.root, 'projects', 'lotus-pay');
  mkdirSync(path.join(dir, 'sources'), { recursive: true });
  const manifest = {
    schemaVersion: 1,
    id: PROJECT_ID,
    name: 'Lotus Pay',
    code: 'LP',
    client: 'Lotus Financial',
    industry: null,
    description: null,
    phase: 'initial',
    methodology: null,
    repository: null,
    createdAt: '2026-11-01T09:00:00+07:00',
  };
  writeFileSync(path.join(dir, 'procheck.json'), JSON.stringify(manifest, null, 2));
  const at = '2026-11-01T09:00:00+07:00';
  const registry = { version: 1, projects: [{ id: PROJECT_ID, dir, addedAt: at, lastOpenedAt: at }] };
  writeFileSync(path.join(sandbox.dataDir, 'projects.json'), JSON.stringify(registry, null, 2));
  return dir;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

test('overview header shows the project identity and its paths', async ({ app, ui, sandbox }) => {
  const dir = seedProject(sandbox);
  await app.restart();
  const { overview } = ui;

  await overview.open(PROJECT_ID);
  await expect(overview.name).toHaveText('Lotus Pay');
  await expect(overview.client).toHaveText('Lotus Financial');
  await expect(overview.dir).toHaveText(dir);
  await expect(overview.repository).toHaveCount(0);
  await expect(overview.vsCode).toBeVisible();
  await expect(overview.ask).toBeVisible();
});

test('project settings save the general section to procheck.json', async ({ app, ui, sandbox }) => {
  const dir = seedProject(sandbox);
  await app.restart();
  const { overview, projectSettings: settings } = ui;
  await overview.open(PROJECT_ID);
  await settings.open();

  await test.step('the form shows the manifest and the save bar stays hidden', async () => {
    await expect(settings.name).toHaveValue('Lotus Pay');
    await expect(settings.code).toHaveValue('LP');
    await expect(settings.repository).toContainText('Not linked');
    await expect(settings.saveBar).toHaveClass(/is-off/);
  });

  await test.step('discard restores the saved values', async () => {
    await settings.client.fill('Someone else');
    await expect(settings.saveBar).not.toHaveClass(/is-off/);
    await settings.discardButton.click();
    await expect(settings.client).toHaveValue('Lotus Financial');
  });

  await test.step('save writes procheck.json and updates the page', async () => {
    await settings.name.fill('Lotus Pay Portal');
    await settings.code.fill('lpp');
    await settings.description.fill('Merchant self-service portal');
    await settings.saveButton.click();
    await expect(settings.saveBar).toHaveClass(/is-off/);
    await expect(settings.title).toHaveText('Lotus Pay Portal');

    const manifest = readJson<Manifest>(path.join(dir, 'procheck.json'));
    expect(manifest).toMatchObject({ id: PROJECT_ID, name: 'Lotus Pay Portal', code: 'LPP', description: 'Merchant self-service portal', client: 'Lotus Financial' });
  });
});

test('remove from list keeps the directory', async ({ app, ui, sandbox }) => {
  const dir = seedProject(sandbox);
  await app.restart();
  const { overview, projectSettings: settings, shell } = ui;
  await overview.open(PROJECT_ID);
  await settings.open();

  await settings.removeButton.click();
  await settings.removeConfirm.click();

  await expect(shell.projectsHero).toBeVisible();
  expect(readJson<Registry>(path.join(sandbox.dataDir, 'projects.json')).projects).toEqual([]);
  expect(existsSync(path.join(dir, 'procheck.json'))).toBe(true);
});

test('delete directory needs the project name and removes everything', async ({ app, ui, sandbox }) => {
  const dir = seedProject(sandbox);
  await app.restart();
  const { overview, projectSettings: settings, shell } = ui;
  await overview.open(PROJECT_ID);
  await settings.open();

  await settings.deleteButton.click();
  await expect(settings.deleteConfirm).toBeDisabled();
  await settings.deleteInput.fill('Lotus');
  await expect(settings.deleteConfirm).toBeDisabled();
  await settings.deleteInput.fill('Lotus Pay');
  await settings.deleteConfirm.click();

  await expect(shell.projectsHero).toBeVisible();
  expect(existsSync(dir)).toBe(false);
  expect(readJson<Registry>(path.join(sandbox.dataDir, 'projects.json')).projects).toEqual([]);
});
