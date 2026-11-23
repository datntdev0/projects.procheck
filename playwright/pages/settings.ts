import type { Locator, Page } from '@playwright/test';

export type SettingsSection = 'about' | 'general' | 'diagnostics' | 'storage' | 'agents';

/** App settings page: in-page navigation and one section per topic. */
export class SettingsPage {
  readonly root: Locator;
  readonly nav: Locator;
  readonly settingsFile: Locator;
  readonly saveBar: Locator;
  readonly saveButton: Locator;
  readonly discardButton: Locator;
  readonly defaultProjectDir: Locator;
  readonly onStartup: Locator;
  readonly theme: Locator;
  readonly language: Locator;
  readonly logLevel: Locator;
  readonly logRetention: Locator;
  readonly logsSummary: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('settings-page');
    this.nav = page.getByTestId('settings-nav');
    this.settingsFile = page.getByTestId('settings-file');
    this.saveBar = page.getByTestId('settings-savebar');
    this.saveButton = page.getByTestId('settings-save');
    this.discardButton = page.getByTestId('settings-discard');
    this.defaultProjectDir = page.getByTestId('setting-default-project-dir');
    this.onStartup = page.getByTestId('setting-on-startup');
    this.theme = page.getByTestId('setting-theme');
    this.language = page.getByTestId('setting-language');
    this.logLevel = page.getByTestId('setting-log-level');
    this.logRetention = page.getByTestId('setting-log-retention');
    this.logsSummary = page.getByTestId('logs-summary');
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
