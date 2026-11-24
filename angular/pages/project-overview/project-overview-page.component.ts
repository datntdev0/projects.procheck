import { ChangeDetectionStrategy, Component } from '@angular/core';

import { injectCurrentProject } from '@layout/current-project';

import { ProjectGateComponent } from '../project/project-gate.component';
import { OverviewHeroComponent } from './overview-hero.component';

/** Project overview (ported from _proto/overview.html; only the header so far). */
@Component({
  selector: 'pc-project-overview-page',
  imports: [OverviewHeroComponent, ProjectGateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-inner overview-page" data-testid="overview-page">
      <pc-project-gate>
        @if (project(); as current) {
          <pc-overview-hero [project]="current" />
        }
      </pc-project-gate>
    </div>
  `,
})
export class ProjectOverviewPageComponent {
  protected readonly project = injectCurrentProject();
}
