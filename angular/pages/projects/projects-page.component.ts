import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '@components/icon/icon.component';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

/** All projects (home). Only the hero is built for now; stats and project lists come later. */
@Component({
  selector: 'pc-projects-page',
  imports: [RouterLink, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-page.component.html',
})
export class ProjectsPageComponent {
  /** Translation key of the time-of-day greeting. */
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'home.greet.morning' : hour < 18 ? 'home.greet.afternoon' : 'home.greet.evening';
  });
}
