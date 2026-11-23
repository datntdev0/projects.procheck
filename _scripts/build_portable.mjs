import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { OUTPUT, appVersion, compress, fail, runShell, targetDirectory } from './common.mjs';

const APP_FOLDER = 'Procheck';
const CRATE = 'procheck';

try {
  runShell('pnpm exec tauri build --no-bundle');

  const exe = path.join(targetDirectory(), 'release', `${CRATE}.exe`);
  if (!existsSync(exe)) throw new Error(`Executable not found: ${exe}`);

  const portableRoot = path.join(OUTPUT, 'portable');
  const appDir = path.join(portableRoot, APP_FOLDER);
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });

  copyFileSync(exe, path.join(appDir, `${APP_FOLDER}.exe`));
  writeFileSync(
    path.join(appDir, 'portable.txt'),
    `${APP_FOLDER} portable mode.\r\nAll application data is stored in the "data" folder next to ${APP_FOLDER}.exe.\r\n`,
  );

  const zip = path.join(portableRoot, `${APP_FOLDER}-${appVersion()}-win-x64-portable.zip`);
  rmSync(zip, { force: true });
  compress(appDir, zip);

  console.log(`\n✔ Portable package: ${zip}`);
} catch (error) {
  fail(error);
}
