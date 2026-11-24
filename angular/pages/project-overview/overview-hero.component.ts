import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';
import { PhaseChipComponent } from '@components/badge/phase-chip.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { projectMonogram } from '@features/projects/project-phases';
import { ReadyProjectItem } from '@features/projects/projects.model';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ProjectActionsService } from '../project/project-actions.service';

/** Header of the project overview (ported from `.ws-hero` in _proto/overview.html). */
@Component({
  selector: 'pc-overview-hero',
  imports: [ButtonComponent, IconComponent, PhaseChipComponent, ProjectAvatarComponent, TooltipDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ws-hero', 'data-testid': 'overview-hero' },
  template: `
    <div class="ws-hero-main">
      <pc-project-avatar class="ws-av" [short]="monogram()" [size]="56" />
      <div class="grow">
        <span class="kicker">{{ 'ws.kicker' | t }}</span>
        <h1 data-testid="overview-name">{{ manifest().name }}</h1>
        <div class="ws-meta">
          @if (manifest().client; as client) {
            <span data-testid="overview-client"><pc-icon name="building-2" [size]="14" /><span>{{ client }}</span></span>
          }
          <pc-phase-chip [phase]="manifest().phase">{{ 'phase.' + manifest().phase | t }}</pc-phase-chip>
        </div>
        <div class="ws-paths">
          <span class="ws-path">
            <pc-icon name="folder" [size]="14" />
            <span class="k">{{ 'ws.dir' | t }}</span>
            <code [title]="project().dir" data-testid="overview-dir">{{ project().dir }}</code>
            <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [pcTooltip]="'ws.copy' | t" (click)="actions.copyPath(project().dir)">
              <pc-icon name="copy" [size]="14" />
            </button>
            <button pcButton size="sm" type="button" data-testid="overview-reveal" (click)="actions.reveal(project().id)">
              <pc-icon name="folder-open" [size]="14" />{{ 'ws.reveal' | t }}
            </button>
          </span>
          @if (manifest().repository; as repository) {
            <span class="ws-path" data-testid="overview-repo">
              <pc-icon name="folder-git-2" [size]="14" />
              <span class="k">{{ 'ws.repo' | t }}</span>
              <code [title]="repository">{{ repository }}</code>
              <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [pcTooltip]="'ws.copy' | t" (click)="actions.copyPath(repository)">
                <pc-icon name="copy" [size]="14" />
              </button>
            </span>
          }
        </div>
      </div>
    </div>
    <div class="ws-actions">
      <button pcButton type="button" data-testid="overview-vscode" (click)="actions.openInVsCode(project().id, vsCodeFolder())">
        <pc-icon name="code-xml" />{{ 'ws.vscode' | t }}
      </button>
      <button pcButton variant="ai" type="button" data-testid="overview-ask"><pc-icon name="sparkles" />{{ 'ws.ask' | t }}</button>
    </div>
  `,
})
export class OverviewHeroComponent {
  readonly project = input.required<ReadyProjectItem>();

  protected readonly actions = inject(ProjectActionsService);
  protected readonly manifest = computed(() => this.project().manifest);
  protected readonly monogram = computed(() => projectMonogram(this.manifest().name, this.manifest().code));
  protected readonly vsCodeFolder = computed(() => this.manifest().repository ?? this.project().dir);
}
