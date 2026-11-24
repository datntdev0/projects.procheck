import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';
import { IconComponent } from '@components/icon/icon.component';
import { PhaseState, phaseState, projectMonogram } from '@features/projects/project-phases';
import { ProjectManifest } from '@features/projects/projects.model';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { PROJECT_NAV, PROJECT_SETTINGS_NAV, ProjectNavItem } from '../navigation';
import { PhaseTrackComponent } from '../phase-track/phase-track.component';

/** Project sidebar: the project card, its phase progress and its pages. */
@Component({
  selector: 'pc-sidebar-project-nav',
  imports: [IconComponent, PhaseTrackComponent, ProjectAvatarComponent, RouterLink, RouterLinkActive, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sb-project-scope', 'data-testid': 'sidebar-project-nav' },
  template: `
    <div class="sb-project">
      <pc-project-avatar [short]="monogram()" />
      <div class="grow" style="min-width: 0">
        <div class="name truncate" data-testid="sidebar-project-name">{{ manifest().name }}</div>
        <div class="meta truncate" [title]="dir()">{{ dir() }}</div>
      </div>
    </div>
    <pc-phase-track [phase]="manifest().phase" />
    <nav class="nav" [attr.aria-label]="'nav.project' | t">
      @for (group of groups; track group.label) {
        <div class="nav-group">
          <div class="nav-group-title"><span>{{ group.label | t }}</span></div>
          @for (item of group.items; track item.segment) {
            <a
              class="nav-item"
              [class.is-locked]="state(item) === 'locked'"
              [routerLink]="link(item)"
              routerLinkActive="is-active"
              [attr.data-testid]="'nav-project-' + item.segment"
            >
              <pc-icon [name]="item.icon" />
              <span class="truncate">{{ item.label | t }}</span>
              @switch (state(item)) {
                @case ('done') {
                  <pc-icon name="check" class="nav-done" [style.color]="'var(--phase-' + item.phase + ')'" />
                }
                @case ('current') {
                  <span class="phase-dot" [style.background]="'var(--phase-' + item.phase + ')'"></span>
                }
                @case ('locked') {
                  <pc-icon name="lock" class="nav-lock" />
                }
              }
            </a>
          }
        </div>
      }
      <div class="nav-group">
        <a class="nav-item" [routerLink]="link(settings)" routerLinkActive="is-active" data-testid="nav-project-settings">
          <pc-icon [name]="settings.icon" />
          <span class="truncate">{{ settings.label | t }}</span>
        </a>
      </div>
    </nav>
  `,
})
export class SidebarProjectNavComponent {
  readonly id = input.required<string>();
  readonly dir = input.required<string>();
  readonly manifest = input.required<ProjectManifest>();

  protected readonly groups = PROJECT_NAV;
  protected readonly settings = PROJECT_SETTINGS_NAV;
  protected readonly monogram = computed(() => projectMonogram(this.manifest().name, this.manifest().code));

  protected link(item: ProjectNavItem): string[] {
    return ['/projects', this.id(), item.segment];
  }

  protected state(item: ProjectNavItem): PhaseState | null {
    return item.phase ? phaseState(this.manifest().phase, item.phase) : null;
  }
}
