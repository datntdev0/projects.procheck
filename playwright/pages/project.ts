import type { Locator, Page } from '@playwright/test';

/** Project overview header (`/projects/:id/overview`). */
export class ProjectOverviewPage {
  readonly root: Locator;
  readonly hero: Locator;
  readonly name: Locator;
  readonly client: Locator;
  readonly dir: Locator;
  readonly repository: Locator;
  readonly vsCode: Locator;
  readonly ask: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('overview-page');
    this.hero = page.getByTestId('overview-hero');
    this.name = page.getByTestId('overview-name');
    this.client = page.getByTestId('overview-client');
    this.dir = page.getByTestId('overview-dir');
    this.repository = page.getByTestId('overview-repo');
    this.vsCode = page.getByTestId('overview-vscode');
    this.ask = page.getByTestId('overview-ask');
  }

  /** Opens the project from the sidebar project list (lands on its overview). */
  async open(projectId: string): Promise<void> {
    await this.page.getByTestId(`sidebar-project-${projectId}`).click();
    await this.hero.waitFor();
  }
}

/** Project settings (`/projects/:id/settings`): General and Danger zone. */
export class ProjectSettingsPage {
  readonly root: Locator;
  readonly title: Locator;
  readonly name: Locator;
  readonly client: Locator;
  readonly code: Locator;
  readonly description: Locator;
  readonly repository: Locator;
  readonly saveBar: Locator;
  readonly saveButton: Locator;
  readonly discardButton: Locator;
  readonly removeButton: Locator;
  readonly removeConfirm: Locator;
  readonly deleteButton: Locator;
  readonly deleteInput: Locator;
  readonly deleteConfirm: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('project-settings-page');
    this.title = page.getByTestId('ps-title');
    this.name = page.getByTestId('ps-name');
    this.client = page.getByTestId('ps-client');
    this.code = page.getByTestId('ps-code');
    this.description = page.getByTestId('ps-description');
    this.repository = page.getByTestId('ps-repo');
    this.saveBar = page.getByTestId('ps-savebar');
    this.saveButton = page.getByTestId('ps-save');
    this.discardButton = page.getByTestId('ps-discard');
    this.removeButton = page.getByTestId('ps-remove');
    this.removeConfirm = page.getByTestId('ps-remove-confirm');
    this.deleteButton = page.getByTestId('ps-delete');
    this.deleteInput = page.getByTestId('ps-delete-input');
    this.deleteConfirm = page.getByTestId('ps-delete-confirm');
  }

  /** Opens the page from the project sidebar. */
  async open(): Promise<void> {
    await this.page.getByTestId('nav-project-settings').click();
    await this.title.waitFor();
  }
}
