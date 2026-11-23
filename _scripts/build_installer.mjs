import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

import { OUTPUT, fail, runShell, targetDirectory } from './common.mjs';

const INSTALLER_EXTENSIONS = new Set(['.exe', '.msi']);

try {
  const bundleDir = path.join(targetDirectory(), 'release', 'bundle');
  rmSync(bundleDir, { recursive: true, force: true });

  runShell('pnpm exec tauri build --bundles nsis,msi');

  const installerDir = path.join(OUTPUT, 'installer');
  mkdirSync(installerDir, { recursive: true });

  const moved = [];
  for (const kind of ['nsis', 'msi']) {
    const dir = path.join(bundleDir, kind);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!INSTALLER_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
      const target = path.join(installerDir, file);
      rmSync(target, { force: true });
      renameSync(path.join(dir, file), target);
      moved.push(target);
    }
  }

  if (moved.length === 0) throw new Error(`No installers found in ${bundleDir}`);
  console.log(`\n✔ Installers:\n${moved.map((f) => `  ${f}`).join('\n')}`);
} catch (error) {
  fail(error);
}
