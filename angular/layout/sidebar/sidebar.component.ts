import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IconComponent } from '@components/icon/icon.component';
import { APP_NAME, APP_VERSION } from '@shared/app/app-version';
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
export class SidebarComponent {
  protected readonly i18n = inject(I18nService);

  protected readonly mainNav = MAIN_NAV;
  protected readonly settingsNav = SETTINGS_NAV;
  protected readonly appName = APP_NAME;
  protected readonly appVersion = APP_VERSION;
}
