import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';

import { AlertComponent } from '@components/alert/alert.component';
import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { FileTileComponent } from '@components/file-tile/file-tile.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { ProjectsService } from '@features/projects/projects.service';
import {
  SOURCE_CATEGORIES,
  SourceCategory,
  SourceKind,
  SourceRecord,
  SourceVisual,
  extensionOf,
  sourceFolder,
  sourceName,
  sourceVisual,
} from '@features/sources/sources.model';
import { injectCurrentProject, injectCurrentProjectId } from '@layout/current-project';
import { formatBytes } from '@shared/format/bytes';
import { formatDate } from '@shared/format/date';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ProjectGateComponent } from '../project/project-gate.component';
import { SourceAccessComponent } from './source-access.component';
import { SourceDetailComponent } from './source-detail.component';
import { SourceUpload } from './source-upload';
import { SourceUploadDialogComponent } from './source-upload-dialog.component';
import { STATUS_FILTERS, SourceSort, SourcesStore, StatusFilter } from './sources-store';

interface Column {
  sort: SourceSort;
  label: TranslationKey;
  cls: string;
}

const COLUMNS: Column[] = [
  { sort: 'name', label: 'src.th.name', cls: '' },
  { sort: 'type', label: 'src.th.type', cls: '' },
  { sort: 'category', label: 'src.th.cat', cls: 'c-cat' },
  { sort: 'size', label: 'src.th.size', cls: 'num' },
  { sort: 'date', label: 'src.th.date', cls: 'c-date' },
  { sort: 'access', label: 'src.th.ai', cls: '' },
];

const SAMPLE_KINDS: SourceKind[] = ['pdf', 'doc', 'slide', 'sheet', 'audio', 'video', 'image', 'email', 'diagram', 'code', 'archive', 'design'];

/** Sources (ported from _proto/sources.html): the files of the project's `sources\` folder as a table. */
@Component({
  selector: 'pc-sources-page',
  imports: [
    AlertComponent,
    ButtonComponent,
    DialogComponent,
    DialogFooterDirective,
    DropdownComponent,
    FileTileComponent,
    IconComponent,
    InputDirective,
    MENU,
    ProjectGateComponent,
    SourceAccessComponent,
    SourceDetailComponent,
    SourceUploadDialogComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  providers: [SourcesStore, SourceUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:focus)': 'onWindowFocus()' },
  templateUrl: './sources-page.component.html',
})
export class SourcesPageComponent {
  protected readonly store = inject(SourcesStore);
  protected readonly upload = inject(SourceUpload);
  private readonly projects = inject(ProjectsService);
  private readonly i18n = inject(I18nService);
  private readonly projectId = injectCurrentProjectId();
  protected readonly project = injectCurrentProject();

  protected readonly columns = COLUMNS;
  protected readonly categories = SOURCE_CATEGORIES;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly sampleKinds = SAMPLE_KINDS;

  protected readonly dragOver = signal(false);
  protected readonly pendingRemove = signal<string[]>([]);
  protected readonly pendingSources = computed(() => this.store.items().filter((s) => this.pendingRemove().includes(s.id)));
  protected readonly selectedIds = computed(() => [...this.store.selected()]);
  protected readonly totalSize = computed(() => formatBytes(this.store.totalBytes()));
  protected readonly chips = computed<(SourceCategory | 'all')[]>(() => ['all', ...this.store.categories()]);

  constructor() {
    effect(() => {
      const id = this.projectId();
      const ready = !!this.project();
      if (id && ready && this.projects.loaded()) untracked(() => void this.store.load(id));
    });
    const subscription = this.projects.onFileDrop(
      (paths) => void this.upload.drop(paths),
      (over) => this.dragOver.set(over && !!this.project() && !this.upload.busy()),
    );
    inject(DestroyRef).onDestroy(() => void subscription.then((unlisten) => unlisten()));
  }

  protected onWindowFocus(): void {
    if (this.project()) void this.store.reload();
  }

  protected askRemove(ids: string[]): void {
    this.pendingRemove.set(ids);
  }

  protected async confirmRemove(): Promise<void> {
    const ids = this.pendingRemove();
    this.pendingRemove.set([]);
    await this.store.remove(ids);
  }

  protected setStatus(event: Event): void {
    this.store.status.set((event.target as HTMLSelectElement).value as StatusFilter);
  }

  protected sortIcon(sort: SourceSort): string {
    if (this.store.sort() !== sort) return 'arrow-up-down';
    return this.store.descending() ? 'arrow-down' : 'arrow-up';
  }

  protected visual(kind: SourceKind): SourceVisual {
    return sourceVisual(kind);
  }

  protected name(source: SourceRecord): string {
    return sourceName(source);
  }

  protected folder(source: SourceRecord): string {
    return sourceFolder(source);
  }

  protected extension(source: SourceRecord): string {
    const extension = extensionOf(sourceName(source));
    return extension ? `.${extension}` : '';
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected date(iso: string): string {
    return formatDate(iso, this.i18n.lang());
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
