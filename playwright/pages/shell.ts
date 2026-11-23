import type { Locator, Page } from '@playwright/test';

/** Main layout chrome: sidebar (app name, version, nav), topbar, canvas, assistant. */
export class ShellPage {
  readonly root: Locator;
  readonly appName: Locator;
  readonly appVersion: Locator;
  readonly canvas: Locator;
  readonly projectsHero: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId('app-shell');
    this.appName = page.getByTestId('app-name');
    this.appVersion = page.getByTestId('app-version');
    this.canvas = page.getByTestId('canvas');
    this.projectsHero = page.getByTestId('projects-hero');
  }
}
