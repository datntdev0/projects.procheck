import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IconComponent } from '@components/icon/icon.component';
import { AppInfo, DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { MAIN_NAV, SETTINGS_NAV } from '../navigation';

@Component({
  selector: 'pc-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sidebar', '[attr.aria-label]': "i18n.t('shell.sidebar')" },
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent implements OnInit {
  private readonly ipc = inject(DesktopIpcService);
  protected readonly i18n = inject(I18nService);

  protected readonly mainNav = MAIN_NAV;
  protected readonly settingsNav = SETTINGS_NAV;
  protected readonly fallbackName = 'Procheck';
  protected readonly appInfo = signal<AppInfo | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.appInfo.set(await this.ipc.appInfo());
    } catch {
      // Outside Tauri (Storybook, plain browser): keep the placeholders.
      this.appInfo.set(null);
    }
  }
}
