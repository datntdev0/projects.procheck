import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';

import { injectCurrentCrumb } from '@layout/breadcrumbs';

/** Placeholder for pages that are not built yet. */
@Component({
  selector: 'pc-coming-soon-page',
  imports: [RouterLink, ButtonComponent, EmptyStateComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-inner" data-testid="coming-soon-page">
      <pc-empty-state icon="sparkles" [title]="(crumb() ?? 'This page') + ' is coming soon'" description="We are still building this screen.">
        <a pcButton routerLink="/projects"><pc-icon name="layout-grid" /> Back to all projects</a>
      </pc-empty-state>
    </div>
  `,
})
export class ComingSoonPageComponent {
  protected readonly crumb = injectCurrentCrumb();
}
