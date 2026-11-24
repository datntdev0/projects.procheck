import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';
import { ProjectsService } from '@features/projects/projects.service';
import { injectCurrentProjectId } from '@layout/current-project';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

/**
 * Wraps every project page: shows its content only for a project with a readable `procheck.json`,
 * otherwise a "not found" or "folder missing" state. Marks the project as opened.
 */
@Component({
  selector: 'pc-project-gate',
  imports: [ButtonComponent, EmptyStateComponent, IconComponent, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (projects.loaded()) {
      @if (project(); as current) {
        @if (current.manifest) {
          <ng-content />
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
  `,
})
export class ProjectGateComponent {
  protected readonly projects = inject(ProjectsService);
  private readonly projectId = injectCurrentProjectId();

  protected readonly project = computed(() => this.projects.find(this.projectId()));

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
