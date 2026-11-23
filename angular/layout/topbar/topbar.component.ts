import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { IconComponent } from '@components/icon/icon.component';
import { KbdComponent } from '@components/kbd/kbd.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { injectCurrentCrumb } from '../breadcrumbs';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'pc-topbar',
  imports: [RouterLink, DropdownComponent, IconComponent, KbdComponent, TooltipDirective, TranslatePipe, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'topbar' },
  templateUrl: './topbar.component.html',
})
export class TopbarComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly i18n = inject(I18nService);
  protected readonly crumb = injectCurrentCrumb();

  protected readonly themes = [
    { id: 'system', label: 'theme.system', icon: 'monitor' },
    { id: 'light', label: 'theme.light', icon: 'sun' },
    { id: 'dark', label: 'theme.dark', icon: 'moon' },
  ];
}
