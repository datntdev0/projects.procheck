import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { IconComponent } from '@components/icon/icon.component';
import { KbdComponent } from '@components/kbd/kbd.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';

import { injectCurrentCrumb } from '../breadcrumbs';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'pc-topbar',
  imports: [RouterLink, DropdownComponent, IconComponent, KbdComponent, TooltipDirective, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'topbar' },
  templateUrl: './topbar.component.html',
})
export class TopbarComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly crumb = injectCurrentCrumb();

  protected readonly themes = [
    { id: 'system', label: 'System', icon: 'monitor' },
    { id: 'light', label: 'Light', icon: 'sun' },
    { id: 'dark', label: 'Dark', icon: 'moon' },
  ];
}
