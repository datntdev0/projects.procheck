import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';
import { injectCurrentCrumb } from '@layout/breadcrumbs';
import { injectCurrentProject } from '@layout/current-project';
import { PhaseTrackComponent } from '@layout/phase-track/phase-track.component';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ProjectGateComponent } from './project-gate.component';

/** Project pages that are not built yet: the phase progress and a coming-soon note. */
@Component({
  selector: 'pc-project-page',
  imports: [ButtonComponent, EmptyStateComponent, IconComponent, PhaseTrackComponent, ProjectGateComponent, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-inner project-page" data-testid="project-page">
      <pc-project-gate>
        @if (project(); as current) {
          <div class="card card-pad project-progress">
            <pc-phase-track [phase]="current.manifest.phase" label="proj.progress" [showValues]="true" />
          </div>
          <pc-empty-state icon="sparkles" [title]="title()" [description]="'proj.soon.desc' | t">
            <a pcButton routerLink="/projects"><pc-icon name="layout-grid" /> {{ 'soon.back' | t }}</a>
          </pc-empty-state>
        }
      </pc-project-gate>
    </div>
  `,
})
export class ProjectPageComponent {
  private readonly i18n = inject(I18nService);
  private readonly crumb = injectCurrentCrumb();

  protected readonly project = injectCurrentProject();
  protected readonly title = computed(() => this.i18n.t('soon.title', { page: this.i18n.t(this.crumb() ?? 'soon.page') }));
}
