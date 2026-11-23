import type { Locator, Page } from '@playwright/test';

export class WelcomePage {
  readonly root: Locator;
  readonly title: Locator;
  readonly version: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId('welcome-page');
    this.title = page.getByTestId('welcome-title');
    this.version = page.getByTestId('welcome-version');
  }
}
