import { Injectable, computed, inject, signal } from '@angular/core';

import { ToastService } from '@components/toast/toast.service';
import {
  SOURCE_CATEGORIES,
  SourceAccess,
  SourceCategory,
  SourceRecord,
  sourceAccess,
  sourceName,
  sourceVisual,
} from '@features/sources/sources.model';
import { SourcesService } from '@features/sources/sources.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';

export type SourceSort = 'name' | 'type' | 'category' | 'size' | 'date' | 'access';
export type StatusFilter = 'all' | 'readable' | 'pending' | 'stored' | 'problem';
export const STATUS_FILTERS: StatusFilter[] = ['all', 'readable', 'pending', 'stored', 'problem'];

const STATUS_OF: Record<SourceAccess, StatusFilter> = {
  indexed: 'readable',
  queued: 'pending',
  indexing: 'pending',
  stored: 'stored',
  failed: 'problem',
  missing: 'problem',
};

const ACCESS_ORDER: SourceAccess[] = ['indexed', 'indexing', 'queued', 'stored', 'failed', 'missing'];

/** Sorts that start in descending order (largest, newest first). */
const DESCENDING_FIRST: SourceSort[] = ['size', 'date'];

const SORT_KEYS: Record<SourceSort, (source: SourceRecord, store: SourcesStore) => string | number> = {
  name: (s) => sourceName(s).toLowerCase(),
  type: (s, store) => store.kindLabel(s),
  category: (s) => SOURCE_CATEGORIES.indexOf(s.category),
  size: (s) => s.bytes,
  date: (s) => s.addedAt,
  access: (s) => ACCESS_ORDER.indexOf(sourceAccess(s)),
};

export function isReadable(source: SourceRecord): boolean {
  return sourceAccess(source) === 'indexed' && sourceVisual(source.kind).mode !== 'store';
}

/** State of the Sources page of one project: the catalog, filters, sort, selection and the open file. */
@Injectable()
export class SourcesStore {
  private readonly sources = inject(SourcesService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly projectId = signal<string | null>(null);
  readonly dir = signal('');
  readonly items = signal<SourceRecord[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);

  readonly query = signal('');
  readonly category = signal<SourceCategory | 'all'>('all');
  readonly status = signal<StatusFilter>('all');
  readonly sort = signal<SourceSort>('date');
  readonly descending = signal(true);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly openId = signal<string | null>(null);
  /** Rows added by the last upload, highlighted once. */
  readonly fresh = signal<ReadonlySet<string>>(new Set());

  readonly open = computed(() => this.items().find((s) => s.id === this.openId()) ?? null);
  readonly totalBytes = computed(() => this.items().reduce((sum, s) => sum + s.bytes, 0));
  readonly readableCount = computed(() => this.items().filter(isReadable).length);
  readonly attentionCount = computed(() => this.items().filter((s) => ['stored', 'problem'].includes(STATUS_OF[sourceAccess(s)])).length);
  readonly categories = computed(() => SOURCE_CATEGORIES.filter((c) => this.items().some((s) => s.category === c)));

  readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    const category = this.category();
    const status = this.status();
    const key = SORT_KEYS[this.sort()];
    const direction = this.descending() ? -1 : 1;
    return this.items()
      .filter((s) => category === 'all' || s.category === category)
      .filter((s) => status === 'all' || STATUS_OF[sourceAccess(s)] === status)
      .filter((s) => !query || s.path.toLowerCase().includes(query))
      .sort((a, b) => compare(key(a, this), key(b, this)) * direction);
  });

  readonly allVisibleSelected = computed(() => {
    const visible = this.visible();
    return visible.length > 0 && visible.every((s) => this.selected().has(s.id));
  });

  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some((s) => this.selected().has(s.id)));

  async load(projectId: string): Promise<void> {
    if (this.projectId() !== projectId) this.reset(projectId);
    this.loading.set(true);
    try {
      const list = await this.sources.list(projectId);
      if (this.projectId() !== projectId) return;
      this.dir.set(list.dir);
      this.items.set(list.sources);
      this.loadError.set(false);
      this.prune();
    } catch (error) {
      console.error('Could not list the sources', error);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  reload(): Promise<void> {
    const id = this.projectId();
    return id ? this.load(id) : Promise.resolve();
  }

  /** Adds rows returned by an upload and highlights them. */
  added(records: SourceRecord[]): void {
    this.fresh.set(new Set(records.map((r) => r.id)));
    void this.reload();
  }

  count(category: SourceCategory | 'all'): number {
    return category === 'all' ? this.items().length : this.items().filter((s) => s.category === category).length;
  }

  kindLabel(source: SourceRecord): string {
    return this.i18n.t(`src.k.${source.kind}`);
  }

  categoryLabel(category: SourceCategory | 'all'): string {
    return this.i18n.t(`src.cat.${category}`);
  }

  setSort(sort: SourceSort): void {
    if (this.sort() === sort) {
      this.descending.update((d) => !d);
    } else {
      this.sort.set(sort);
      this.descending.set(DESCENDING_FIRST.includes(sort));
    }
  }

  clearFilters(): void {
    this.query.set('');
    this.category.set('all');
    this.status.set('all');
  }

  toggleSelected(id: string, on: boolean): void {
    this.selected.update((set) => toggled(set, [id], on));
  }

  toggleAllVisible(on: boolean): void {
    this.selected.update((set) => toggled(set, this.visible().map((s) => s.id), on));
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  toggleOpen(id: string): void {
    this.openId.update((current) => (current === id ? null : id));
  }

  async setCategory(source: SourceRecord, category: SourceCategory): Promise<void> {
    const id = this.projectId();
    if (!id || source.category === category) return;
    try {
      const updated = await this.sources.setCategory(id, source.id, category);
      this.items.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
      this.toast.show(this.i18n.t('src.t.cat', { c: this.categoryLabel(category) }), { icon: 'folder' });
    } catch (error) {
      this.fail(error);
    }
  }

  async openFile(source: SourceRecord): Promise<void> {
    await this.run(() => this.sources.open(this.requireProject(), source.id));
  }

  async reveal(source: SourceRecord | null): Promise<void> {
    await this.run(() => this.sources.reveal(this.requireProject(), source?.id ?? null));
  }

  async remove(ids: string[]): Promise<void> {
    const id = this.projectId();
    if (!id || !ids.length) return;
    try {
      const removed = await this.sources.remove(id, ids);
      this.toast.show(this.i18n.t('src.t.removed', { n: removed.length }), { icon: 'trash-2' });
    } catch (error) {
      this.fail(error, 'src.t.locked');
    }
    await this.reload();
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.fail(error);
    }
  }

  private requireProject(): string {
    const id = this.projectId();
    if (!id) throw new Error('No project is open');
    return id;
  }

  private fail(error: unknown, fallback: TranslationKey = 'src.t.failed'): void {
    console.error('Source action failed', error);
    const missing = error instanceof DesktopIpcError && error.code === 'missing';
    this.toast.show(this.i18n.t(missing ? 'src.t.missing' : fallback), { icon: 'circle-alert', tone: 'danger', duration: 6000 });
  }

  /** Drops the selection and the open file when their rows are gone. */
  private prune(): void {
    const ids = new Set(this.items().map((s) => s.id));
    this.selected.update((set) => new Set([...set].filter((id) => ids.has(id))));
    if (!ids.has(this.openId() ?? '')) this.openId.set(null);
  }

  private reset(projectId: string): void {
    this.projectId.set(projectId);
    this.dir.set('');
    this.items.set([]);
    this.loadError.set(false);
    this.clearFilters();
    this.clearSelection();
    this.openId.set(null);
    this.fresh.set(new Set());
  }
}

function compare(a: string | number, b: string | number): number {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function toggled(set: ReadonlySet<string>, ids: string[], on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}
