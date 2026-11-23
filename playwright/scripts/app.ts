import type { Page } from '@playwright/test';

import { type LaunchedApp, launchApp } from './launch.ts';
import type { Sandbox } from './sandbox.ts';

/** Owns the lifecycle of one running app instance bound to a sandbox. */
export class AppSession {
  private launched: LaunchedApp | null = null;

  constructor(private readonly sandbox: Sandbox) {}

  get page(): Page {
    if (!this.launched) throw new Error('App is not running');
    return this.launched.page;
  }

  get running(): boolean {
    return this.launched !== null;
  }

  async start(): Promise<void> {
    if (this.launched) throw new Error('App is already running');
    this.launched = await launchApp(this.sandbox);
  }

  async stop(): Promise<void> {
    const launched = this.launched;
    this.launched = null;
    await launched?.stop();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}
