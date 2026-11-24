import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';
import { ProjectsService } from '@features/projects/projects.service';
import { injectCurrentCrumb } from '@layout/breadcrumbs';
import { injectCurrentProjectId } from '@layout/current-project';
import { PhaseTrackComponent } from '@layout/phase-track/phase-track.component';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

/** Pages of a project. None is built yet: each shows the phase progress and a coming-soon note. */
@Component({
  selector: 'pc-project-page',
  imports: [ButtonComponent, EmptyStateComponent, IconComponent, PhaseTrackComponent, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-inner project-page" data-testid="project-page">
      @if (projects.loaded()) {
        @if (project(); as current) {
          @if (current.manifest; as manifest) {
            <div class="card card-pad project-progress">
              <pc-phase-track [phase]="manifest.phase" label="proj.progress" [showValues]="true" />
            </div>
            <pc-empty-state icon="sparkles" [title]="title()" [description]="'proj.soon.desc' | t">
              <a pcButton routerLink="/projects"><pc-icon name="layout-grid" /> {{ 'soon.back' | t }}</a>
            </pc-empty-state>
          } @else {
            <pc-empty-state icon="triangle-alert" [title]="'proj.missing.title' | t" [description]="'proj.missing.desc' | t: { dir: current.dir }">
              <a pcButton routerLink="/projects"><pc-icon name="layout-grid" /> {{ 'soon.back' | t }}</a>
            </pc-empty-state>
          }
        } @else {
          <pc-empty-state icon="folder" [title]="'proj.nf.title' | t" [description]="'proj.nf.desc' | t">
            <a pcButton routerLink="/projects"><pc-icon name="layout-grid" /> {{ 'soon.back' | t }}</a>
          </pc-empty-state>
        }
      }
    </div>
  `,
})
export class ProjectPageComponent {
  protected readonly projects = inject(ProjectsService);
  private readonly i18n = inject(I18nService);
  private readonly crumb = injectCurrentCrumb();
  private readonly projectId = injectCurrentProjectId();

  protected readonly project = computed(() => this.projects.find(this.projectId()));
  protected readonly title = computed(() => this.i18n.t('soon.title', { page: this.i18n.t(this.crumb() ?? 'soon.page') }));

  constructor() {
    effect(() => {
      const id = this.projectId();
      if (id && this.projects.loaded()) untracked(() => void this.markOpened(id));
    });
  }

  private async markOpened(id: string): Promise<void> {
    if (!this.projects.find(id)) return;
    try {
      await this.projects.open(id);
    } catch (error) {
      console.error(`Could not open project ${id}`, error);
    }
  }
}
