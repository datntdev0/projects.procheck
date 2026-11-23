import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { CARD } from '@components/card/card.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { StorageService } from '@features/storage/storage.service';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SettingsSectionComponent } from './settings-section.component';
import { AboutSectionComponent } from './sections/about-section.component';
import { StorageSectionComponent } from './sections/storage-section.component';
import { SETTINGS_NAV, SETTINGS_SECTION_IDS, SettingsSectionId } from './settings-sections';

/** Offset (px) below the top of the canvas at which a section counts as the current one. */
const SPY_OFFSET = 90;

/** App settings (ported from _proto/settings.html): in-page navigation + one section per topic. */
@Component({
  selector: 'pc-settings-page',
  imports: [ButtonComponent, IconComponent, TranslatePipe, SettingsSectionComponent, ...CARD, AboutSectionComponent, StorageSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.component.html',
})
export class SettingsPageComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

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
