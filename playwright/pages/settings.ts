import type { Locator, Page } from '@playwright/test';

export type SettingsSection = 'about' | 'general' | 'diagnostics' | 'storage';

/** App settings page: in-page navigation and one section per topic. */
export class SettingsPage {
  readonly root: Locator;
  readonly nav: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('settings-page');
    this.nav = page.getByTestId('settings-nav');
  }

  /** Opens the page from the sidebar. */
  async open(): Promise<void> {
    await this.page.getByTestId('nav-settings').click();
    await this.root.waitFor();
  }

  navItem(section: SettingsSection): Locator {
    return this.page.getByTestId(`settings-nav-${section}`);
  }

  section(section: SettingsSection): Locator {
    return this.page.getByTestId(`settings-section-${section}`);
  }
}
