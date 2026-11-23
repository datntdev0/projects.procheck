import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { type Browser, type Page, chromium } from '@playwright/test';

import { appExecutable } from './paths.ts';
import type { Sandbox } from './sandbox.ts';

const CONNECT_TIMEOUT_MS = 60_000;

export interface LaunchedApp {
  browser: Browser;
  page: Page;
  process: ChildProcess;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

async function connect(port: number, child: ChildProcess, deadline: number): Promise<Browser> {
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`App exited early with code ${child.exitCode}`);
    }
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`Could not connect to WebView2 over CDP on port ${port}: ${String(lastError)}`);
}

async function firstAppPage(browser: Browser, deadline: number): Promise<Page> {
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((p) => p.url().startsWith('http'));
      if (page) return page;
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for the app page');
}

/** Spawns the real exe with an isolated data dir and attaches Playwright via CDP. */
export async function launchApp(sandbox: Sandbox): Promise<LaunchedApp> {
  const exe = appExecutable();
  if (!existsSync(exe)) {
    throw new Error(`App executable not found: ${exe}. Run "pnpm playwright:build" first.`);
  }

  const port = await freePort();
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      PROCHECK_DATA_DIR: sandbox.dataDir,
      WEBVIEW2_USER_DATA_FOLDER: sandbox.webviewDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: 'ignore',
  });

  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  try {
    const browser = await connect(port, child, deadline);
    const page = await firstAppPage(browser, deadline);

    return {
      browser,
      page,
      process: child,
      async stop() {
        await browser.close().catch(() => undefined);
        killTree(child.pid);
        if (child.exitCode === null) {
          await new Promise<void>((resolve) => {
            child.once('exit', () => resolve());
            setTimeout(resolve, 5_000);
          });
        }
      },
    };
  } catch (error) {
    killTree(child.pid);
    throw error;
  }
}
