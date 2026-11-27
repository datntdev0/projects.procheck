import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { FileTileComponent } from '@components/file-tile/file-tile.component';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { SOURCE_CATEGORIES, SourceCategory, SourceRecord, sourceAccess, sourceFolder, sourceName, sourceVisual } from '@features/sources/sources.model';
import { formatBytes } from '@shared/format/bytes';
import { formatDate } from '@shared/format/date';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SourceAccessComponent } from './source-access.component';
import { SourcesStore } from './sources-store';

const INDEX_FOLDER = '.procheck\\index\\';

/** Side panel with the details and actions of the source opened in the table. */
@Component({
  selector: 'pc-source-detail',
  imports: [ButtonComponent, FileTileComponent, IconComponent, SourceAccessComponent, TooltipDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sd', 'data-testid': 'src-detail' },
  template: `
    @let s = source();
    <div class="sd-head">
      <pc-file-tile [kind]="visual().tile" [icon]="visual().icon" />
      <div class="grow" style="min-width: 0">
        <h4 data-testid="src-detail-name">{{ name() }}</h4>
        <div class="text-xs text-subtle">{{ store.kindLabel(s) }} · {{ size() }}</div>
      </div>
      <button pcButton variant="ghost" size="sm" [iconOnly]="true" [pcTooltip]="'src.det.close' | t" (click)="closed.emit()">
        <pc-icon name="x" />
      </button>
    </div>

    <div class="sd-sec sd-acts">
      <button pcButton size="sm" [disabled]="!!s.missing" (click)="store.openFile(s)"><pc-icon name="external-link" /> {{ 'src.a.open' | t }}</button>
      <button pcButton size="sm" [iconOnly]="true" [disabled]="!!s.missing" [pcTooltip]="'src.a.reveal' | t" (click)="store.reveal(s)">
        <pc-icon name="folder-search" />
      </button>
    </div>

    <div class="sd-sec">
      <div class="sd-h">{{ 'src.det.access' | t }}</div>
      <pc-source-access [source]="s" />
      <p class="sd-note">{{ note() | t }}</p>
      @if (s.index.error) {
        <p class="sd-note text-danger">{{ s.index.error }}</p>
      }
    </div>

    <div class="sd-sec">
      <div class="sd-h">{{ 'src.det.title' | t }}</div>
      <dl class="kv">
        <dt>{{ 'src.det.cat' | t }}</dt>
        <dd>
          <select class="select" data-testid="src-detail-category" [value]="s.category" (change)="setCategory($event)">
            @for (c of categories; track c) {
              <option [value]="c" [selected]="c === s.category">{{ store.categoryLabel(c) }}</option>
            }
          </select>
        </dd>
        @if (folder()) {
          <dt>{{ 'src.det.folder' | t }}</dt>
          <dd>{{ folder() }}</dd>
        }
        <dt>{{ 'src.det.added' | t }}</dt>
        <dd>{{ date(s.addedAt) }}</dd>
        <dt>{{ 'src.det.modified' | t }}</dt>
        <dd>{{ date(s.modifiedAt) }}</dd>
        <dt>{{ 'src.det.path' | t }}</dt>
        <dd class="mono" data-testid="src-detail-path">{{ location() }}</dd>
        @if (indexed()) {
          <dt>{{ 'src.det.index' | t }}</dt>
          <dd class="mono">{{ indexPath() }}</dd>
        }
        <dt>{{ 'src.det.hash' | t }}</dt>
        <dd class="mono" [title]="s.sha256">{{ s.sha256.slice(0, 16) }}…</dd>
      </dl>
    </div>

    <div class="sd-sec">
      <button pcButton variant="ghost" size="sm" class="text-danger" data-testid="src-detail-remove" (click)="removed.emit()">
        <pc-icon name="trash-2" /> {{ 'src.a.remove' | t }}
      </button>
    </div>
  `,
})
export class SourceDetailComponent {
  protected readonly store = inject(SourcesStore);
  private readonly i18n = inject(I18nService);

  readonly source = input.required<SourceRecord>();
  readonly closed = output();
  readonly removed = output();

  protected readonly categories = SOURCE_CATEGORIES;
  protected readonly visual = computed(() => sourceVisual(this.source().kind));
  protected readonly name = computed(() => sourceName(this.source()));
  protected readonly folder = computed(() => sourceFolder(this.source()));
  protected readonly size = computed(() => formatBytes(this.source().bytes));
  protected readonly location = computed(() => `${this.store.dir()}\\${this.source().path.replaceAll('/', '\\')}`);
  protected readonly indexed = computed(() => this.visual().mode !== 'store');
  protected readonly indexPath = computed(() => `${INDEX_FOLDER}${this.source().id}\\`);

  protected readonly note = computed(() => {
    const access = sourceAccess(this.source());
    if (access === 'missing') return 'src.d.missing';
    if (access === 'queued') return 'src.d.queued';
    return `src.d.${this.visual().mode}`;
  });

  protected date(iso: string): string {
    return formatDate(iso, this.i18n.lang());
  }

  protected setCategory(event: Event): void {
    void this.store.setCategory(this.source(), (event.target as HTMLSelectElement).value as SourceCategory);
  }
}
