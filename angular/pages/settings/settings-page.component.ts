import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { PageHeaderComponent } from '@components/page-header/page-header.component';
import { ToastService } from '@components/toast/toast.service';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { StorageService } from '@features/storage/storage.service';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { AboutSectionComponent } from './sections/about-section.component';
import { AgentsSectionComponent } from './sections/agents-section.component';
import { DiagnosticsSectionComponent } from './sections/diagnostics-section.component';
import { GeneralSectionComponent } from './sections/general-section.component';
import { StorageSectionComponent } from './sections/storage-section.component';
import { SectionSpy } from './section-spy';
import { SettingsFormService } from './settings-form.service';
import { SETTINGS_NAV, SETTINGS_SECTION_IDS, SettingsSectionId } from './settings-sections';

/** App settings (ported from _proto/settings.html): in-page navigation + one section per topic. */
@Component({
  selector: 'pc-settings-page',
  imports: [
    ButtonComponent,
    IconComponent,
    PageHeaderComponent,
    TranslatePipe,
    AboutSectionComponent,
    GeneralSectionComponent,
    DiagnosticsSectionComponent,
    StorageSectionComponent,
    AgentsSectionComponent,
  ],
  providers: [SettingsFormService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.component.html',
})
export class SettingsPageComponent {
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly form = inject(SettingsFormService);
  private readonly route = inject(ActivatedRoute);

  protected readonly settingsFile = inject(AppSettingsService).filePath;
  protected readonly nav = SETTINGS_NAV;
  private readonly sections = new SectionSpy<SettingsSectionId>(SETTINGS_SECTION_IDS);
  protected readonly active = this.sections.active;

  constructor() {
    // Links such as `/settings#agents` open on that section.
    afterNextRender(() => {
      const section = SETTINGS_SECTION_IDS.find((id) => id === this.route.snapshot.fragment);
      if (section) this.go(section);
    });
  }

  protected async openDataFolder(): Promise<void> {
    try {
      await this.storage.open();
    } catch {
      this.toast.show(this.i18n.t('set.st.open.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  protected async save(): Promise<void> {
    const result = await this.form.save();
    if (result.ok) {
      this.toast.show(this.i18n.t('set.saved'), { tone: 'success' });
    } else if (result.field === 'defaultProjectDir') {
      this.toast.show(this.i18n.t('set.gen.parent.missing'), { icon: 'circle-alert', tone: 'danger' });
      this.go('general');
    } else {
      this.toast.show(this.i18n.t('set.save.failed', { reason: result.message }), { icon: 'circle-alert', tone: 'danger', duration: 6000 });
    }
  }

  protected discard(): void {
    this.form.discard();
    this.toast.show(this.i18n.t('set.discarded'), { icon: 'undo-2' });
  }

  protected go(id: SettingsSectionId): void {
    this.sections.go(id);
  }
}
