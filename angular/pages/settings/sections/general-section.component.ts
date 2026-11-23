import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { SegmentedComponent, SegmentedOption } from '@components/form/segmented.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { STARTUP_VIEWS, StartupView } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { I18nService, LANGS, Lang } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';
import { THEME_PREFERENCES, ThemePreference, ThemeService, themeIcon } from '@shared/theme/theme.service';

import { SettingsFormService } from '../settings-form.service';
import { SETTINGS_SECTION } from '../settings-section.component';

/** General: default project folder and startup view (save bar), theme and language (applied immediately). */
@Component({
  selector: 'pc-general-section',
  imports: [ButtonComponent, InputDirective, IconComponent, SegmentedComponent, TranslatePipe, ...SETTINGS_SECTION],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="general" [title]="'set.n.general' | t" [description]="'set.general.d' | t">
      <div class="card">
        <pc-setting-row [label]="'set.gen.parent' | t" [description]="'set.gen.parent.d' | t">
          <input
            pcInput
            class="mono"
            data-testid="setting-default-project-dir"
            [invalid]="form.invalidField() === 'defaultProjectDir'"
            [placeholder]="'set.gen.parent.ph' | t"
            [value]="form.value().general.defaultProjectDir"
            (input)="form.patchGeneral({ defaultProjectDir: $any($event.target).value })"
          />
          <button pcButton type="button" data-testid="setting-browse-project-dir" (click)="browse()">
            <pc-icon name="folder-open" />
            {{ 'set.browse' | t }}
          </button>
        </pc-setting-row>

        <pc-setting-row [label]="'set.gen.startup' | t" [description]="'set.gen.startup.d' | t">
          <select
            pcInput
            class="sm"
            data-testid="setting-on-startup"
            [value]="form.value().general.onStartup"
            (change)="form.patchGeneral({ onStartup: $any($event.target).value })"
          >
            @for (view of startupViews; track view) {
              <option [value]="view" [selected]="view === form.value().general.onStartup">{{ 'set.gen.startup.' + view | t }}</option>
            }
          </select>
        </pc-setting-row>

        <pc-setting-row [label]="'shell.theme' | t" [description]="'set.theme.d' | t">
          <pc-segmented data-testid="setting-theme" [options]="themeOptions()" [value]="theme.preference()" (valueChange)="setTheme($event)" />
        </pc-setting-row>

        <pc-setting-row [label]="'shell.lang' | t" [description]="'set.lang.d' | t">
          <pc-segmented data-testid="setting-language" [options]="langOptions()" [value]="i18n.lang()" (valueChange)="setLang($event)" />
        </pc-setting-row>
      </div>
    </pc-settings-section>
  `,
})
export class GeneralSectionComponent {
  protected readonly form = inject(SettingsFormService);
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(I18nService);
  private readonly settings = inject(AppSettingsService);
  private readonly toast = inject(ToastService);

  protected readonly startupViews: StartupView[] = STARTUP_VIEWS;

  protected readonly themeOptions = computed<SegmentedOption[]>(() =>
    THEME_PREFERENCES.map((pref) => ({ value: pref, label: this.i18n.t(`theme.${pref}`), icon: themeIcon(pref) })),
  );
  protected readonly langOptions = computed<SegmentedOption[]>(() => LANGS.map((lang) => ({ value: lang, label: this.i18n.t(`lang.${lang}`) })));

  protected setTheme(value: string): void {
    this.theme.setPreference(value as ThemePreference);
  }

  protected setLang(value: string): void {
    this.i18n.setLang(value as Lang);
  }

  protected async browse(): Promise<void> {
    const current = this.form.value().general.defaultProjectDir.trim();
    try {
      const picked = await this.settings.pickFolder(this.i18n.t('set.gen.parent'), current || null);
      if (picked) this.form.patchGeneral({ defaultProjectDir: picked });
    } catch {
      this.toast.show(this.i18n.t('set.browse.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }
}
