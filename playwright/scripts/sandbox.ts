import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface Sandbox {
  root: string;
  dataDir: string;
  webviewDir: string;
  dispose(): Promise<void>;
}

/** Creates an isolated temp folder for one test run. */
export function createSandbox(): Sandbox {
  const root = mkdtempSync(path.join(tmpdir(), 'procheck-e2e-'));
  const dataDir = path.join(root, 'data');
  const webviewDir = path.join(root, 'webview');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(webviewDir, { recursive: true });

  return {
    root,
    dataDir,
    webviewDir,
    async dispose() {
      // WebView2 may hold file locks for a moment after the process exits.
      for (let attempt = 1; ; attempt++) {
        try {
          rmSync(root, { recursive: true, force: true });
          return;
        } catch (error) {
          if (attempt >= 10) throw error;
          await delay(500);
        }
      }
    },
  };
}
