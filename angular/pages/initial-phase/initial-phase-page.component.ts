import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { PhaseChipComponent } from '@components/badge/phase-chip.component';
import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';
import { TabItem, TabsComponent } from '@components/tabs/tabs.component';
import { injectCurrentProject } from '@layout/current-project';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ProjectGateComponent } from '../project/project-gate.component';
import { DEFAULT_ARTIFACTS, INITIAL_STEPS, InitialStep, phasePercent } from './initial-steps';
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
 * UI only for now — steps come from the default workflow with nothing started; other tabs are coming soon.
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
  template: `
    <div class="canvas-inner initial-page" data-testid="initial-page">
      <pc-project-gate>
        @if (project(); as current) {
          <div class="page-header">
            <div class="ip-head">
              <pc-phase-chip phase="initial">{{ 'phase.initial' | t }}</pc-phase-chip>
              <h1 class="mt-2">{{ 'in.title' | t }}</h1>
              <div class="subtitle">
                {{ (current.manifest.client ? 'in.sub' : 'in.sub_noclient') | t: { client: current.manifest.client ?? '' } }}
              </div>
            </div>
            <div class="row gap-2 wrap">
              <button pcButton type="button" data-testid="initial-export">
                <pc-icon name="package" />{{ 'in.export' | t }}<pc-icon name="chevron-down" [size]="14" />
              </button>
              <button pcButton variant="ai" type="button" data-testid="initial-ask">
                <pc-icon name="sparkles" />{{ 'in.ask' | t }}
              </button>
            </div>
          </div>

          <pc-tabs class="ph-tabs" [items]="tabs()" [(active)]="tab" data-testid="initial-tabs" />

          <div class="tab-panel" role="tabpanel" [attr.data-testid]="'initial-panel-' + tab()">
            @if (tab() === 'overview') {
              <pc-phase-progress [steps]="steps()" />
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

  protected readonly project = injectCurrentProject();
  protected readonly tab = signal<string>('overview');

  /** Default workflow, nothing started yet: Discovery is the current step. */
  protected readonly steps = computed<InitialStep[]>(() =>
    INITIAL_STEPS.map((id, i) => ({
      id,
      status: i === 0 ? 'current' : 'todo',
      artifacts: DEFAULT_ARTIFACTS[id].map((a) => ({ id: a.id, name: this.i18n.t(a.name), status: 'not_started' })),
    })),
  );

  protected readonly tabs = computed<TabItem[]>(() =>
    TABS.map((t) => ({
      id: t.id,
      icon: t.icon,
      label: this.i18n.t(`in.tab.${t.id}` as TranslationKey),
      count: t.id === 'overview' ? `${phasePercent(this.steps())}%` : undefined,
    })),
  );

  protected readonly soonTitle = computed(() =>
    this.i18n.t('soon.title', { page: this.i18n.t(`in.tab.${this.tab()}` as TranslationKey) }),
  );
}
