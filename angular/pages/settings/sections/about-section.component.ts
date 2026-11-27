import { ChangeDetectionStrategy, Component, OnInit, VERSION, computed, inject, signal } from '@angular/core';
import { getTauriVersion } from '@tauri-apps/api/app';

import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { StorageEntry, StorageService } from '@features/storage/storage.service';
import { APP_NAME, APP_VERSION } from '@shared/app/app-version';
import { UpdateCheckResult, UpdateService } from '@shared/app/update.service';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SettingsSectionComponent } from '../settings-section.component';

@Component({
  selector: 'pc-about-section',
  imports: [ButtonComponent, IconComponent, TranslatePipe, SettingsSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="about" [title]="'set.n.about' | t">
      <button pcSettingsSectionActions pcButton size="sm" type="button" data-testid="check-update" [disabled]="checking()" (click)="checkForUpdates()">
        @if (checking()) {
          <span class="spinner" aria-hidden="true"></span>
          {{ 'set.about.checking' | t }}
        } @else {
          <pc-icon name="refresh-cw" />
          {{ 'set.about.check' | t }}
        }
      </button>
      <div class="about-id">
        <img class="mark" src="assets/brand/kms-mark.svg" alt="" />
        <div class="grow">
          <b>{{ appName }}</b>
          <div class="text-xs text-subtle">{{ 'set.about.tag' | t }}</div>
        </div>
      </div>
      <dl class="kv about-kv">
        <dt>{{ 'set.about.ver' | t }}</dt>
        <dd>
          <span data-testid="about-version">{{ version }}</span>
          @if (lastCheck()) {
            <span class="about-status" data-testid="update-status">
              <pc-icon name="badge-check" [size]="14" />
              {{ 'set.about.upto' | t }} · {{ checkedAt() }}
            </span>
          }
        </dd>
        <dt>{{ 'set.about.settings' | t }}</dt>
        <dd><code data-testid="about-settings-file">{{ paths()?.settings ?? '—' }}</code></dd>
        <dt>{{ 'set.about.registry' | t }}</dt>
        <dd><code data-testid="about-registry-file">{{ paths()?.projects ?? '—' }}</code></dd>
        <dt>{{ 'set.about.runtime' | t }}</dt>
        <dd>{{ runtime() }}</dd>
      </dl>
      <div class="brand-foot">
        <img class="logo-light" src="assets/brand/kms-logo.svg" alt="KMS Technology" />
        <img class="logo-dark" src="assets/brand/kms-logo-white.svg" alt="KMS Technology" />
        <span class="text-xs text-subtle">{{ 'set.about.foot' | t }}</span>
      </div>
    </pc-settings-section>
  `,
})
export class AboutSectionComponent implements OnInit {
  private readonly updates = inject(UpdateService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly storage = inject(StorageService);

  protected readonly appName = APP_NAME;
  protected readonly version = APP_VERSION;
  protected readonly checking = signal(false);
  protected readonly lastCheck = signal<UpdateCheckResult | null>(null);
  private readonly tauriVersion = signal<string | null>(null);
  /** Absolute paths of the app data files, keyed by entry; `null` outside the desktop app. */
  protected readonly paths = signal<Partial<Record<StorageEntry, string>> | null>(null);

  protected readonly runtime = computed(() => `Tauri ${this.tauriVersion() ?? '2'} · Angular ${VERSION.full}`);
  protected readonly checkedAt = computed(() => {
    const check = this.lastCheck();
    if (!check) return '';
    const time = check.checkedAt.toLocaleTimeString(this.i18n.lang(), { hour: '2-digit', minute: '2-digit' });
    return this.i18n.t('set.about.checked', { time });
  });

  async ngOnInit(): Promise<void> {
    try {
      this.tauriVersion.set(await getTauriVersion());
      const overview = await this.storage.overview();
      this.paths.set(Object.fromEntries(overview.items.map((item) => [item.entry, item.path])));
    } catch {
      // Outside Tauri (Storybook, plain browser): major Tauri version only, no file paths.
    }
  }

  protected async checkForUpdates(): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    try {
      const result = await this.updates.check();
      this.lastCheck.set(result);
      this.toast.show(this.i18n.t(result.upToDate ? 'set.about.upto' : 'set.about.available', { version: result.latestVersion }), {
        icon: result.upToDate ? 'badge-check' : 'download',
        tone: result.upToDate ? 'success' : 'default',
      });
    } finally {
      this.checking.set(false);
    }
  }
}
