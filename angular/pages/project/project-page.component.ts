import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PhaseChipComponent } from '@components/badge/phase-chip.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { PageHeaderComponent } from '@components/page-header/page-header.component';
import { ProgressComponent } from '@components/progress/progress.component';
import { phaseProgress } from '@features/projects/project-phases';
import { PHASES } from '@features/projects/projects.model';
import { injectCurrentCrumb } from '@layout/breadcrumbs';
import { injectCurrentProject } from '@layout/current-project';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ProjectGateComponent } from './project-gate.component';

/**
 * Project pages that are not built yet (locked-phase pattern of _proto/scaffolding.html):
 * a flat page head and one panel with the phase progress as ruled columns.
 */
@Component({
  selector: 'pc-project-page',
  imports: [
    ButtonComponent,
    IconComponent,
    PageHeaderComponent,
    PhaseChipComponent,
    ProgressComponent,
    ProjectGateComponent,
    RouterLink,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-inner project-page" data-testid="project-page">
      <pc-project-gate>
        @if (project(); as current) {
          <pc-page-header [title]="title()" [subtitle]="'proj.soon.desc' | t">
            <a pcPageActions pcButton routerLink="/projects"><pc-icon name="layout-grid" />{{ 'soon.back' | t }}</a>
          </pc-page-header>

          <section class="card project-progress" data-testid="phase-track">
            <div class="panel-head">
              <h4>{{ 'proj.progress' | t }}</h4>
              <pc-phase-chip [phase]="current.manifest.phase">{{ 'phase.' + current.manifest.phase | t }}</pc-phase-chip>
            </div>
            <div class="pp-cols">
              @for (col of phases(); track col.phase) {
                <div class="pp-col" [class.is-current]="col.phase === current.manifest.phase">
                  <div class="row between">
                    <span class="pp-name">{{ 'phase.' + col.phase | t }}</span>
                    <b class="pp-val">{{ col.value }}%</b>
                  </div>
                  <pc-progress [value]="col.value" [color]="'var(--phase-' + col.phase + ')'" />
                </div>
              }
            </div>
          </section>
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
  protected readonly phases = computed(() => {
    const phase = this.project()?.manifest.phase;
    return PHASES.map((p) => ({ phase: p, value: phase ? phaseProgress(phase, p) : 0 }));
  });
}
