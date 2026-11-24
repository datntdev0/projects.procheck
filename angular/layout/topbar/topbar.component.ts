import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';
import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { projectMonogram } from '@features/projects/project-phases';
import { IconComponent } from '@components/icon/icon.component';
import { KbdComponent } from '@components/kbd/kbd.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';
import { THEME_PREFERENCES, ThemeService, themeIcon } from '@shared/theme/theme.service';

import { injectAssistantHidden, injectCurrentCrumb } from '../breadcrumbs';
import { injectCurrentProject } from '../current-project';
import { LayoutService } from '../layout.service';

@Component({
  selector: 'pc-topbar',
  imports: [RouterLink, ProjectAvatarComponent, DropdownComponent, IconComponent, KbdComponent, TooltipDirective, TranslatePipe, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'topbar' },
  templateUrl: './topbar.component.html',
})
export class TopbarComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly themeIcon = themeIcon;
  protected readonly crumb = injectCurrentCrumb();
  protected readonly assistantHidden = injectAssistantHidden();

  protected readonly project = injectCurrentProject();
  protected readonly monogram = computed(() => {
    const manifest = this.project()?.manifest;
    return manifest ? projectMonogram(manifest.name, manifest.code) : '';
  });

  protected readonly themes = THEME_PREFERENCES;
}
