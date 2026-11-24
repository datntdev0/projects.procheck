import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';
import { PhaseChipComponent } from '@components/badge/phase-chip.component';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { projectMonogram } from '@features/projects/project-phases';
import { ProjectManifest } from '@features/projects/projects.model';
import { ProjectsService } from '@features/projects/projects.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

/** App sidebar: every registered project, most recently opened first. */
@Component({
  selector: 'pc-sidebar-project-list',
  imports: [IconComponent, PhaseChipComponent, ProjectAvatarComponent, RouterLink, RouterLinkActive, TooltipDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nav-group', 'data-testid': 'sidebar-projects' },
  template: `
    <div class="nav-group-title"><span>{{ 'nav.recent_projects' | t }}</span></div>
    @for (project of projects.projects(); track project.id) {
      @if (project.manifest; as manifest) {
        <a class="nav-item" [routerLink]="['/projects', project.id]" routerLinkActive="is-active" [attr.data-testid]="'sidebar-project-' + project.id">
          <pc-project-avatar [short]="monogram(manifest)" [size]="22" />
          <span class="truncate" [title]="manifest.name">{{ manifest.name }}</span>
          <pc-phase-chip [phase]="manifest.phase">{{ 'phase.' + manifest.phase | t }}</pc-phase-chip>
        </a>
      } @else {
        <a class="nav-item is-missing" [routerLink]="['/projects', project.id]" [pcTooltip]="'nav.project.missing' | t">
          <pc-icon name="triangle-alert" />
          <span class="truncate mono" [title]="project.dir">{{ project.dir }}</span>
        </a>
      }
    } @empty {
      <div class="nav-empty">{{ 'nav.projects.empty' | t }}</div>
    }
  `,
})
export class SidebarProjectListComponent {
  protected readonly projects = inject(ProjectsService);

  protected monogram(manifest: ProjectManifest): string {
    return projectMonogram(manifest.name, manifest.code);
  }
}
