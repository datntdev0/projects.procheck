import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { DiagnosticsService, LogsSummary } from '@features/diagnostics/diagnostics.service';
import { LOG_LEVELS, LOG_RETENTION_CHOICES, LogLevel } from '@features/settings/app-settings.model';
import { StorageService } from '@features/storage/storage.service';
import { formatBytes } from '@shared/format/bytes';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SettingsFormService } from '../settings-form.service';
import { SETTINGS_SECTION } from '../settings-section.component';

/** Diagnostics: log level and retention (save bar), logs folder, and the support bundle. */
@Component({
  selector: 'pc-diagnostics-section',
  imports: [ButtonComponent, InputDirective, IconComponent, TranslatePipe, ...SETTINGS_SECTION],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="diagnostics" [title]="'set.n.diagnostics' | t" [description]="'set.diag.d' | t">
      <div class="card">
        <pc-setting-row [label]="'set.log.level' | t" [description]="'set.log.level.d' | t">
          <select
            pcInput
            class="sm"
            data-testid="setting-log-level"
            [value]="form.value().diagnostics.logLevel"
            (change)="setLevel($any($event.target).value)"
          >
            @for (level of levels; track level) {
              <option [value]="level" [selected]="level === form.value().diagnostics.logLevel">{{ 'set.log.level.' + level | t }}</option>
            }
          </select>
        </pc-setting-row>

        <pc-setting-row [label]="'set.log.ret' | t" [description]="'set.log.ret.d' | t">
          <select
            pcInput
            class="sm"
            data-testid="setting-log-retention"
            [value]="form.value().diagnostics.logRetentionDays"
            (change)="setRetention($any($event.target).value)"
          >
            @for (days of retentionChoices(); track days) {
              <option [value]="days" [selected]="days === form.value().diagnostics.logRetentionDays">{{ 'set.log.days' | t: { n: days } }}</option>
            }
          </select>
        </pc-setting-row>

        <pc-setting-row [label]="'set.log.folder' | t">
          <div pcSettingDescription class="sdesc" data-testid="logs-summary">
            @if (logs(); as summary) {
              <code>{{ summary.dir }}</code> · {{ size(summary.bytes) }} · {{ 'set.log.files' | t: { n: summary.files } }}
            } @else {
              {{ 'set.log.folder.d' | t }}
            }
          </div>
          <button pcButton type="button" data-testid="open-logs" (click)="openLogs()">
            <pc-icon name="folder-open" />
            {{ 'set.log.open' | t }}
          </button>
        </pc-setting-row>

        <pc-setting-row [label]="'set.log.export' | t" [description]="'set.log.export.d' | t">
          <button pcButton type="button" data-testid="export-diagnostics" [disabled]="exporting()" (click)="exportBundle()">
            @if (exporting()) {
              <span class="spinner" aria-hidden="true"></span>
            } @else {
              <pc-icon name="package-open" />
            }
            {{ 'set.log.export.btn' | t }}
          </button>
        </pc-setting-row>
      </div>
    </pc-settings-section>
  `,
})
export class DiagnosticsSectionComponent implements OnInit {
  protected readonly form = inject(SettingsFormService);
  private readonly diagnostics = inject(DiagnosticsService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly levels: LogLevel[] = LOG_LEVELS;
  protected readonly size = formatBytes;
  protected readonly logs = signal<LogsSummary | null>(null);
  protected readonly exporting = signal(false);

  /** Standard choices plus the stored value when settings.json holds another number. */
  protected readonly retentionChoices = computed(() =>
    [...new Set([...LOG_RETENTION_CHOICES, this.form.value().diagnostics.logRetentionDays])].sort((a, b) => a - b),
  );

  ngOnInit(): void {
    void this.refreshLogs();
  }

  protected setLevel(value: string): void {
    this.form.patchDiagnostics({ logLevel: value as LogLevel });
  }

  protected setRetention(value: string): void {
    this.form.patchDiagnostics({ logRetentionDays: Number(value) });
  }

  protected async openLogs(): Promise<void> {
    try {
      await this.storage.open('logs');
    } catch {
      this.toast.show(this.i18n.t('set.st.open.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  protected async exportBundle(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const path = await this.diagnostics.exportBundle(this.i18n.t('set.log.export'));
      if (path) this.toast.show(this.i18n.t('set.log.exported', { path }), { icon: 'package-open', tone: 'success', duration: 6000 });
    } catch {
      this.toast.show(this.i18n.t('set.log.export.failed'), { icon: 'circle-alert', tone: 'danger' });
    } finally {
      this.exporting.set(false);
      void this.refreshLogs();
    }
  }

  private async refreshLogs(): Promise<void> {
    try {
      this.logs.set(await this.diagnostics.logs());
    } catch {
      this.logs.set(null);
    }
  }
}
