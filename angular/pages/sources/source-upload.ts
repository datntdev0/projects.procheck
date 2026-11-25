import { Injectable, computed, inject, signal } from '@angular/core';

import { ToastService } from '@components/toast/toast.service';
import { ImportProgress, SourceCandidate, SourceCategory } from '@features/sources/sources.model';
import { SourcesService } from '@features/sources/sources.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';

import { SourcesStore } from './sources-store';

/** A picked file in the upload dialog, with the category chosen for it. */
export interface UploadRow {
  candidate: SourceCandidate;
  category: SourceCategory;
}

/** The Upload files dialog: picked or dropped files waiting to be copied into `sources\`. */
@Injectable()
export class SourceUpload {
  private readonly sources = inject(SourcesService);
  private readonly store = inject(SourcesStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly open = signal(false);
  readonly rows = signal<UploadRow[]>([]);
  readonly inspecting = signal(false);
  readonly busy = signal(false);
  readonly progress = signal<ImportProgress | null>(null);

  readonly usable = computed(() => this.rows().filter((r) => !r.candidate.problem));
  readonly readableCount = computed(() => this.usable().filter((r) => r.candidate.mode !== 'store').length);
  readonly storedCount = computed(() => this.usable().length - this.readableCount());
  readonly percent = computed(() => {
    const step = this.progress();
    return step ? Math.round((step.index / Math.max(step.total, 1)) * 100) : 0;
  });

  show(): void {
    if (!this.busy()) this.rows.set([]);
    this.open.set(true);
  }

  close(): void {
    if (this.busy()) return;
    this.open.set(false);
    this.rows.set([]);
  }

  async pick(folders: boolean): Promise<void> {
    const id = this.store.projectId();
    if (!id || this.busy()) return;
    const title = this.i18n.t(folders ? 'src.up.folder' : 'src.up.files');
    await this.collect(() => this.sources.pick(id, folders, title));
  }

  /** Files dropped on the page: opens the dialog with them, or adds them to the open one. */
  async drop(paths: string[]): Promise<void> {
    const id = this.store.projectId();
    if (!id || this.busy() || !paths.length) return;
    if (!this.open()) this.show();
    await this.collect(() => this.sources.inspect(id, paths));
  }

  remove(path: string): void {
    this.rows.update((rows) => rows.filter((r) => r.candidate.path !== path));
  }

  setCategory(path: string, category: SourceCategory): void {
    this.rows.update((rows) => rows.map((r) => (r.candidate.path === path ? { ...r, category } : r)));
  }

  async submit(): Promise<void> {
    const id = this.store.projectId();
    const rows = this.usable();
    if (!id || !rows.length || this.busy()) return;
    this.busy.set(true);
    try {
      const items = rows.map((r) => ({ path: r.candidate.path, relative: r.candidate.relative, category: r.category }));
      const added = await this.sources.import(id, items, (step) => this.progress.set(step));
      this.toast.show(this.i18n.t('src.up.done', { n: added.length }), { icon: 'upload' });
      this.busy.set(false);
      this.close();
      this.store.added(added);
    } catch (error) {
      console.error('Could not add the sources', error);
      const reason = error instanceof DesktopIpcError ? error.reason : String(error);
      this.toast.show(this.i18n.t('src.up.failed', { reason }), { icon: 'circle-alert', tone: 'danger', duration: 8000 });
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  private async collect(load: () => Promise<SourceCandidate[]>): Promise<void> {
    this.inspecting.set(true);
    try {
      const candidates = await load();
      this.rows.update((rows) => [
        ...rows,
        ...candidates.filter((c) => !rows.some((r) => r.candidate.path === c.path)).map((candidate) => ({ candidate, category: candidate.category })),
      ]);
    } catch (error) {
      console.error('Could not read the picked files', error);
      this.toast.show(this.i18n.t('src.t.failed'), { icon: 'circle-alert', tone: 'danger' });
    } finally {
      this.inspecting.set(false);
    }
  }
}
