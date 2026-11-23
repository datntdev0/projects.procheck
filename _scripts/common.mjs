import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DESKTOP = path.join(ROOT, 'desktop');
export const OUTPUT = path.join(ROOT, '_output');

/** Runs a command without a shell; throws when it fails. */
export function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`"${command} ${args.join(' ')}" exited with code ${result.status}`);
  }
  return result;
}

/** Runs a command line through the shell (needed for .cmd shims such as pnpm on Windows). */
export function runShell(commandLine, options = {}) {
  console.log(`> ${commandLine}`);
  const result = spawnSync(commandLine, { cwd: ROOT, stdio: 'inherit', shell: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`"${commandLine}" exited with code ${result.status}`);
  }
  return result;
}

/** Cargo target directory as reported by `cargo metadata`. */
export function targetDirectory() {
  const result = spawnSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    cwd: DESKTOP,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`cargo metadata failed: ${result.stderr}`);
  return JSON.parse(result.stdout).target_directory;
}

/** App version from `desktop/tauri.conf.json`. */
export function appVersion() {
  const config = JSON.parse(readFileSync(path.join(DESKTOP, 'tauri.conf.json'), 'utf8'));
  return config.version;
}

/** Zips `sourceDir` (including the folder itself) into `zipFile` using Windows' bsdtar. */
export function compress(sourceDir, zipFile) {
  const tar =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  run(tar, ['-a', '-c', '-f', zipFile, '-C', path.dirname(sourceDir), path.basename(sourceDir)]);
}

/** Prints the error and marks the process as failed. */
export function fail(error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
