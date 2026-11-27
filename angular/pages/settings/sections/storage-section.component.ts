import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { AlertComponent } from '@components/alert/alert.component';
import { BadgeComponent } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { StorageEntry, StorageOverview, StorageService } from '@features/storage/storage.service';
import { formatBytes } from '@shared/format/bytes';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SettingsSectionComponent } from '../settings-section.component';

const APP_ITEM_DESC: Record<StorageEntry, TranslationKey> = {
  settings: 'set.st.a.settings',
  projects: 'set.st.a.projects',
  logs: 'set.st.a.logs',
  cli: 'set.st.a.cli',
  tools: 'set.st.a.tools',
  git: 'set.st.a.git',
  chats: 'set.st.a.chats',
  cache: 'set.st.a.cache',
};

/** Layout of a project directory (Procheck writes it when a project is created). */
const PROJECT_ITEMS: { path: string; desc: TranslationKey }[] = [
  { path: 'procheck.json', desc: 'set.st.p.manifest' },
  { path: 'sources\\', desc: 'set.st.p.sources' },
  { path: 'artifacts\\', desc: 'set.st.p.artifacts' },
  { path: 'board\\', desc: 'set.st.p.board' },
  { path: '.procheck\\chats\\', desc: 'set.st.p.chats' },
  { path: '.procheck\\runs\\', desc: 'set.st.p.runs' },
  { path: '.procheck\\cli\\<cli>\\', desc: 'set.st.p.cli' },
  { path: '.procheck\\worktrees\\', desc: 'set.st.p.worktrees' },
  { path: '.procheck\\settings.json', desc: 'set.st.p.settings' },
];

function itemIcon(path: string, isDirectory: boolean): string {
  return isDirectory ? 'folder' : path.endsWith('.json') ? 'file-json' : 'file';
}

const PROJECT_TREE = PROJECT_ITEMS.map((item) => ({ ...item, icon: itemIcon(item.path, item.path.endsWith('\\')) }));

/** Storage: where application data (this PC) and project data (each project directory) live. */
@Component({
  selector: 'pc-storage-section',
  imports: [AlertComponent, BadgeComponent, ButtonComponent, IconComponent, TooltipDirective, TranslatePipe, SettingsSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="storage" [title]="'set.n.storage' | t" [description]="'set.storage.d' | t">
      <button pcSettingsSectionActions pcButton size="sm" type="button" data-testid="storage-refresh" [disabled]="loading()" (click)="load()">
        <pc-icon name="refresh-cw" />
        {{ 'set.st.refresh' | t }}
      </button>

      <div class="bound">
        <div class="zone" data-testid="storage-app-zone">
          <div class="zone-head">
            <span class="zone-cap">{{ 'set.st.bound.l' | t }}</span>
            <div class="zone-top">
              <pc-icon name="monitor-cog" [size]="15" />
              <h3>{{ 'set.st.app' | t }}</h3>
              <pc-badge tone="brand">{{ 'set.st.app.badge' | t }}</pc-badge>
            </div>
            <div class="zone-root">
              <span class="truncate" data-testid="storage-root" [title]="overview()?.root ?? ''">{{ overview()?.root ?? '…' }}</span>
              <span class="sz" data-testid="storage-total">{{ overview() ? size(overview()!.totalBytes) : '' }}</span>
              <button
                pcButton
                variant="ghost"
                size="sm"
                [iconOnly]="true"
                type="button"
                data-testid="storage-open-root"
                [pcTooltip]="'set.st.open' | t"
                [attr.aria-label]="'set.st.open' | t"
                (click)="open()"
              >
                <pc-icon name="external-link" />
              </button>
            </div>
          </div>

          @if (error(); as message) {
            <pc-alert tone="danger" class="zone-error" [title]="'set.st.error' | t">{{ message }}</pc-alert>
          } @else if (overview(); as data) {
            <div class="ztree">
              @for (item of data.items; track item.entry) {
                <div class="znode" [class.is-missing]="!item.exists" [attr.data-testid]="'storage-item-' + item.entry">
                  <pc-icon [name]="icon(item.name, item.isDirectory)" [size]="14" />
                  <span class="zp" [title]="item.path">{{ item.name }}</span>
                  <span class="zs">
                    @if (item.exists) {
                      {{ size(item.bytes) }}
                    } @else {
                      {{ 'set.st.missing' | t }}
                    }
                  </span>
                  <span class="zd">{{ appDesc[item.entry] | t }}</span>
                </div>
              }
            </div>
          } @else {
            <div class="zone-loading"><span class="spinner" aria-hidden="true"></span></div>
          }

          <div class="zone-foot">
            <pc-icon name="shield-check" [size]="14" />
            <span>{{ 'set.st.app.foot' | t }}</span>
          </div>
        </div>

        <div class="zone proj" data-testid="storage-project-zone">
          <div class="zone-head">
            <span class="zone-cap">{{ 'set.st.bound.r' | t }}</span>
            <div class="zone-top">
              <pc-icon name="folder-kanban" [size]="15" />
              <h3>{{ 'set.st.proj' | t }}</h3>
              <pc-badge tone="teal">{{ 'set.st.proj.badge' | t }}</pc-badge>
            </div>
            <div class="zone-root">
              <span class="truncate">{{ 'set.st.proj.root' | t }}</span>
            </div>
          </div>
          <div class="ztree">
            @for (item of projectItems; track item.path) {
              <div class="znode">
                <pc-icon [name]="item.icon" [size]="14" />
                <span class="zp" [title]="item.path">{{ item.path }}</span>
                <span class="zs"></span>
                <span class="zd">{{ item.desc | t }}</span>
              </div>
            }
          </div>
          <div class="zone-foot">
            <pc-icon name="package" [size]="14" />
            <span>{{ 'set.st.proj.foot' | t }}</span>
          </div>
        </div>
      </div>
    </pc-settings-section>
  `,
})
export class StorageSectionComponent implements OnInit {
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly appDesc = APP_ITEM_DESC;
  protected readonly projectItems = PROJECT_TREE;
  protected readonly icon = itemIcon;
  protected readonly size = formatBytes;

  protected readonly overview = signal<StorageOverview | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.overview.set(await this.storage.overview());
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async open(): Promise<void> {
    try {
      await this.storage.open();
    } catch {
      this.toast.show(this.i18n.t('set.st.open.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }
}
