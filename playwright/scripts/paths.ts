import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const outputRoot = path.join(repoRoot, '_output', 'playwright');

/** Debug exe built by `pnpm playwright:build`; override with `PROCHECK_EXE`. */
export function appExecutable(): string {
  const override = process.env['PROCHECK_EXE'];
  if (override) return path.resolve(override);
  return path.join(repoRoot, '_output', 'desktop', 'target', 'debug', 'procheck.exe');
}
