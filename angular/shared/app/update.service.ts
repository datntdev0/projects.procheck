import { Injectable } from '@angular/core';

import { APP_VERSION } from './app-version';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  upToDate: boolean;
  checkedAt: Date;
}

/** Simulated round-trip so the "Checking…" state is visible. */
const CHECK_DELAY_MS = 700;

/**
 * Checks for a newer Procheck release. There is no update server yet, so the
 * check always reports the running version as the latest one.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  async check(): Promise<UpdateCheckResult> {
    await new Promise((resolve) => setTimeout(resolve, CHECK_DELAY_MS));
    return { currentVersion: APP_VERSION, latestVersion: APP_VERSION, upToDate: true, checkedAt: new Date() };
  }
}
