import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '../scripts/fixtures.ts';
import { PROJECT_ID, readJson, seedProject, writeFiles } from '../scripts/seed.ts';

interface Catalog {
  sources: { id: string; path: string; kind: string; category: string; missing?: boolean; index: { state: string } }[];
}

function catalog(dir: string): Catalog['sources'] {
  return readJson<Catalog>(path.join(dir, '.procheck', 'sources.json')).sources;
}

function catalogEntry(dir: string, relative: string): Catalog['sources'][number] | undefined {
  return catalog(dir).find((s) => s.path === relative);
}

test('lists the sources folder and picks up files changed outside Procheck', async ({ app, ui, sandbox }) => {
  const dir = seedProject(sandbox);
  const sources = path.join(dir, 'sources');
  writeFiles(sources, { 'RFP.pdf': 'rfp', 'wireframes.fig': 'fig', 'Workshop/agenda.md': '# Agenda' });
  await app.restart();
  const { overview, sources: page } = ui;
  await overview.open(PROJECT_ID);
  await page.open();

  await test.step('files on disk are listed with their kind and recorded in the catalog', async () => {
    await expect(page.rows).toHaveCount(3);
    await expect(page.fileCount).toHaveText('3');
    await expect(page.row('wireframes.fig').locator('[data-access]')).toHaveAttribute('data-access', 'stored');
    await expect(page.row('Workshop/agenda.md').locator('[data-access]')).toHaveAttribute('data-access', 'queued');
    expect(catalog(dir).map((s) => [s.path, s.kind]).sort()).toEqual([
      ['RFP.pdf', 'pdf'],
      ['Workshop/agenda.md', 'md'],
      ['wireframes.fig', 'design'],
    ]);
  });

  await test.step('added and deleted files show up when the window gets focus again', async () => {
    writeFiles(sources, { 'Kickoff.m4a': 'audio' });
    rmSync(path.join(sources, 'RFP.pdf'));
    await page.refresh();
    await expect(page.rows).toHaveCount(4);
    await expect(page.row('Kickoff.m4a')).toBeVisible();
    await expect(page.row('RFP.pdf').locator('[data-access]')).toHaveAttribute('data-access', 'missing');
    expect(catalogEntry(dir, 'RFP.pdf')?.missing).toBe(true);
  });
});

test('upload copies dropped files and folders and flags duplicates', async ({ app, ui, sandbox }) => {
  const dir = seedProject(sandbox);
  writeFiles(path.join(dir, 'sources'), { 'agenda.md': '# Agenda' });
  const incoming = path.join(sandbox.root, 'incoming');
  writeFiles(incoming, {
    'Requirements.pptx': 'slides',
    'Logo.sketch': 'design',
    'agenda copy.md': '# Agenda',
    'Meeting notes/day 1.vtt': 'WEBVTT',
  });
  await app.restart();
  const { overview, sources: page } = ui;
  await overview.open(PROJECT_ID);
  await page.open();
  await expect(page.rows).toHaveCount(1);

  await test.step('dropped files and folders are listed with their kind and duplicates are flagged', async () => {
    await page.drop(['Requirements.pptx', 'Logo.sketch', 'agenda copy.md', 'Meeting notes'].map((name) => path.join(incoming, name)));
    await expect(page.uploadRows).toHaveCount(4);
    await expect(page.uploadRow('Meeting notes/day 1.vtt')).toBeVisible();
    await expect(page.uploadRow('agenda copy.md').getByTestId('src-up-duplicate')).toContainText('agenda.md');
    await expect(page.uploadSummary).toHaveText('4 file(s) · 3 readable · 1 stored only');
  });

  await test.step('removing a row and adding copies the rest into the sources folder', async () => {
    await page.uploadRow('agenda copy.md').getByRole('button', { name: 'Remove from list' }).click();
    await page.uploadGo.click();
    await expect(page.rows).toHaveCount(4);
    expect(readFileSync(path.join(dir, 'sources', 'Meeting notes', 'day 1.vtt'), 'utf8')).toBe('WEBVTT');
    expect(existsSync(path.join(dir, 'sources', 'agenda copy.md'))).toBe(false);
    expect(catalogEntry(dir, 'Logo.sketch')?.index.state).toBe('stored');
    expect(catalogEntry(dir, 'Requirements.pptx')?.index.state).toBe('queued');
    expect(existsSync(path.join(incoming, 'Requirements.pptx'))).toBe(true);
  });
});

test('filters, category changes and removal update the folder and the catalog', async ({ app, ui, sandbox }) => {
  const dir = seedProject(sandbox);
  const sources = path.join(dir, 'sources');
  writeFiles(sources, { 'RFP.pdf': 'rfp', 'forecast.xlsx': 'xlsx', 'schema.sql': 'sql', 'logo.png': 'png' });
  await app.restart();
  const { overview, sources: page } = ui;
  await overview.open(PROJECT_ID);
  await page.open();
  await expect(page.rows).toHaveCount(4);

  await test.step('search and category chips narrow the table', async () => {
    await page.search.fill('fore');
    await expect.poll(() => page.names()).toEqual(['forecast.xlsx']);
    await page.search.fill('');
    await page.root.getByTestId('src-cat-code').click();
    await expect.poll(() => page.names()).toEqual(['schema.sql']);
    await page.root.getByTestId('src-cat-all').click();
    await expect(page.rows).toHaveCount(4);
  });

  await test.step('moving a file to another category is saved', async () => {
    await page.moveTo('logo.png', 'design');
    await expect(page.row('logo.png').getByTestId('src-category')).toHaveText('Designs & diagrams');
    expect(catalogEntry(dir, 'logo.png')?.category).toBe('design');
  });

  await test.step('removing the selected files deletes them from the folder', async () => {
    await page.check('RFP.pdf');
    await page.check('schema.sql');
    await expect(page.bulk).toContainText('2 selected');
    await page.bulkRemove.click();
    await page.removeConfirm.click();
    await expect(page.rows).toHaveCount(2);
    expect(existsSync(path.join(sources, 'RFP.pdf'))).toBe(false);
    expect(existsSync(path.join(sources, 'schema.sql'))).toBe(false);
    expect(catalog(dir).map((s) => s.path).sort()).toEqual(['forecast.xlsx', 'logo.png']);
  });
});
