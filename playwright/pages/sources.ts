import type { Locator, Page } from '@playwright/test';

/** Sources (`/projects/:id/sources`): the table of source files and the upload dialog. */
export class SourcesPage {
  readonly root: Locator;
  readonly rows: Locator;
  readonly empty: Locator;
  readonly search: Locator;
  readonly status: Locator;
  readonly fileCount: Locator;
  readonly detail: Locator;
  readonly detailCategory: Locator;
  readonly bulk: Locator;
  readonly bulkRemove: Locator;
  readonly removeConfirm: Locator;
  readonly uploadButton: Locator;
  readonly uploadRows: Locator;
  readonly uploadSummary: Locator;
  readonly uploadGo: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('sources-page');
    this.rows = page.getByTestId('src-row');
    this.empty = page.getByTestId('src-empty');
    this.search = page.getByTestId('src-search');
    this.status = page.getByTestId('src-status');
    this.fileCount = page.getByTestId('src-stat-files');
    this.detail = page.getByTestId('src-detail');
    this.detailCategory = page.getByTestId('src-detail-category');
    this.bulk = page.getByTestId('src-bulk');
    this.bulkRemove = page.getByTestId('src-bulk-remove');
    this.removeConfirm = page.getByTestId('src-remove-confirm');
    this.uploadButton = page.getByTestId('src-upload');
    this.uploadRows = page.getByTestId('src-up-row');
    this.uploadSummary = page.getByTestId('src-up-sum');
    this.uploadGo = page.getByTestId('src-up-go');
  }

  /** Opens the page from the project sidebar (the project must already be open). */
  async open(): Promise<void> {
    await this.page.getByTestId('nav-project-sources').click();
    await this.root.waitFor();
  }

  row(path: string): Locator {
    return this.page.locator(`[data-testid="src-row"][data-path="${path}"]`);
  }

  names(): Promise<string[]> {
    return this.page.getByTestId('src-name').allTextContents();
  }

  check(path: string): Promise<void> {
    return this.row(path).getByTestId('src-check').check();
  }

  async moveTo(path: string, category: string): Promise<void> {
    await this.row(path).getByTestId('src-row-menu').click();
    await this.page.getByTestId(`src-move-${category}`).click();
  }

  uploadRow(relative: string): Locator {
    return this.uploadRows.filter({ hasText: relative });
  }

  /** Reloads the list the way the page does when the window gets focus back from File Explorer. */
  async refresh(): Promise<void> {
    await this.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  }

  /**
   * Drops files and folders on the window. Emits the event Tauri sends for a native drop, which a
   * test cannot perform on a WebView2 window.
   */
  drop(paths: string[]): Promise<void> {
    return this.page.evaluate(async (dropped) => {
      const tauri = (window as unknown as { __TAURI_INTERNALS__: { invoke(cmd: string, args: unknown): Promise<unknown> } }).__TAURI_INTERNALS__;
      await tauri.invoke('plugin:event|emit', { event: 'tauri://drag-drop', payload: { paths: dropped, position: { x: 0, y: 0 } } });
    }, paths);
  }
}
