import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { PhaseChipComponent } from '@components/badge/phase-chip.component';
import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';
import { TabItem, TabsComponent } from '@components/tabs/tabs.component';
import { ArtifactsStore } from '@features/projects/artifacts.store';
import { ProjectsService } from '@features/projects/projects.service';
import { injectCurrentProject, injectCurrentProjectId } from '@layout/current-project';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ProjectGateComponent } from '../project/project-gate.component';
import { InitialStep, emptySteps, phasePercent, toInitialSteps } from './initial-steps';
import { PhaseProgressComponent } from './phase-progress.component';

type InitialTab = 'overview' | 'discovery' | 'clarifications' | 'requirements' | 'milestones' | 'estimation';

const TABS: { id: InitialTab; icon: string }[] = [
  { id: 'overview', icon: 'layout-dashboard' },
  { id: 'discovery', icon: 'compass' },
  { id: 'clarifications', icon: 'message-circle-question-mark' },
  { id: 'requirements', icon: 'list-checks' },
  { id: 'milestones', icon: 'milestone' },
  { id: 'estimation', icon: 'calculator' },
];

/**
 * Initial phase (ported from _proto/initial.html): header, tabs and the Overview's phase progress.
 * Steps, artifacts and their statuses come from the project's artifacts (`ArtifactsStore`); other tabs are coming soon.
 */
@Component({
  selector: 'pc-initial-phase-page',
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    PhaseChipComponent,
    PhaseProgressComponent,
    ProjectGateComponent,
    TabsComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:focus)': 'onWindowFocus()' },
  template: `
    <div class="canvas-inner initial-page" data-testid="initial-page">
      <pc-project-gate>
        @if (project(); as current) {
          <header class="page-head">
            <div class="grow ip-head">
              <pc-phase-chip phase="initial">{{ 'phase.initial' | t }}</pc-phase-chip>
              <h1 class="mt-2">{{ 'in.title' | t }}</h1>
              <div class="meta">
                <span>{{ (current.manifest.client ? 'in.sub' : 'in.sub_noclient') | t: { client: current.manifest.client ?? '' } }}</span>
              </div>
            </div>
            <div class="actions">
              <button pcButton type="button" data-testid="initial-export">
                <pc-icon name="package" />{{ 'in.export' | t }}<pc-icon name="chevron-down" [size]="14" />
              </button>
              <button pcButton variant="ai" type="button" data-testid="initial-ask">
                <pc-icon name="sparkles" />{{ 'in.ask' | t }}
              </button>
            </div>
          </header>

          <pc-tabs class="ph-tabs" [items]="tabs()" [(active)]="tab" data-testid="initial-tabs" />

          <div class="tab-panel" role="tabpanel" [attr.data-testid]="'initial-panel-' + tab()">
            @if (tab() === 'overview') {
              <pc-phase-progress [projectId]="current.id" [steps]="steps()" />
            } @else {
              <pc-empty-state icon="sparkles" [title]="soonTitle()" [description]="'in.soon.desc' | t" />
            }
          </div>
        }
      </pc-project-gate>
    </div>
  `,
})
export class InitialPhasePageComponent {
  private readonly i18n = inject(I18nService);
  private readonly store = inject(ArtifactsStore);
  private readonly projects = inject(ProjectsService);
  private readonly projectId = injectCurrentProjectId();

  protected readonly project = injectCurrentProject();
  protected readonly tab = signal<string>('overview');

  /** The steps of the project; before they are known (or without customization) none has artifacts yet. */
  protected readonly steps = computed<InitialStep[]>(() => {
    const overview = this.store.overview(this.projectId());
    return overview?.steps.length ? toInitialSteps(overview.steps) : emptySteps();
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      const ready = !!this.project();
      if (id && ready && this.projects.loaded()) untracked(() => void this.store.load(id));
    });
  }

  protected readonly tabs = computed<TabItem[]>(() =>
    TABS.map((t) => ({
      id: t.id,
      icon: t.icon,
      label: this.i18n.t(`in.tab.${t.id}` as TranslationKey),
      count: t.id === 'overview' ? `${phasePercent(this.steps())}%` : undefined,
    })),
  );

  protected onWindowFocus(): void {
    const id = this.projectId();
    if (id && this.project()) void this.store.load(id);
  }

  protected readonly soonTitle = computed(() =>
    this.i18n.t('soon.title', { page: this.i18n.t(`in.tab.${this.tab()}` as TranslationKey) }),
  );
}
