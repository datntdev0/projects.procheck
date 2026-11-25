import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Sandbox } from './sandbox.ts';

export const PROJECT_ID = '6f1c2b1e-3d4a-4c5b-9e8f-0a1b2c3d4e5f';

/** Writes a project directory and registers it in `projects.json`; returns the project directory. */
export function seedProject(sandbox: Sandbox): string {
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

/** Writes `files` (relative path → content) under `dir`, creating folders as needed. */
export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}
