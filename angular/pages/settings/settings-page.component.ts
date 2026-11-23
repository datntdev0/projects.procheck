import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
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
import { SettingsFormService } from './settings-form.service';
import { SETTINGS_NAV, SETTINGS_SECTION_IDS, SettingsSectionId } from './settings-sections';

/** Offset (px) below the top of the canvas at which a section counts as the current one. */
const SPY_OFFSET = 90;

/** App settings (ported from _proto/settings.html): in-page navigation + one section per topic. */
@Component({
  selector: 'pc-settings-page',
  imports: [
    ButtonComponent,
    IconComponent,
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly form = inject(SettingsFormService);

  protected readonly settingsFile = inject(AppSettingsService).filePath;
  protected readonly nav = SETTINGS_NAV;
  protected readonly active = signal<SettingsSectionId>(SETTINGS_SECTION_IDS[0]);

  constructor() {
    afterNextRender(() => {
      const canvas = this.host.nativeElement.closest<HTMLElement>('.canvas');
      if (!canvas) return;
      const onScroll = () => this.spy(canvas);
      canvas.addEventListener('scroll', onScroll, { passive: true });
      this.destroyRef.onDestroy(() => canvas.removeEventListener('scroll', onScroll));
      this.spy(canvas);
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
    } else if (result.field === 'claudeBinPath' || result.field === 'codexBinPath') {
      this.toast.show(this.i18n.t('set.ag.bin.missing'), { icon: 'circle-alert', tone: 'danger' });
      this.go('agents');
    } else {
      this.toast.show(this.i18n.t('set.save.failed', { reason: result.message }), { icon: 'circle-alert', tone: 'danger', duration: 6000 });
    }
  }

  protected discard(): void {
    this.form.discard();
    this.toast.show(this.i18n.t('set.discarded'), { icon: 'undo-2' });
  }

  protected go(id: SettingsSectionId): void {
    this.section(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.active.set(id);
  }

  private section(id: SettingsSectionId): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(`[data-sec="${id}"]`);
  }

  /** Marks the last section whose top has scrolled past the offset; the bottom of the page selects the last one. */
  private spy(canvas: HTMLElement): void {
    const top = canvas.getBoundingClientRect().top + SPY_OFFSET;
    let current = SETTINGS_SECTION_IDS[0];
    for (const id of SETTINGS_SECTION_IDS) {
      const el = this.section(id);
      if (el && el.getBoundingClientRect().top <= top) current = id;
    }
    if (canvas.scrollTop + canvas.clientHeight >= canvas.scrollHeight - 4) {
      current = SETTINGS_SECTION_IDS[SETTINGS_SECTION_IDS.length - 1];
    }
    this.active.set(current);
  }
}
