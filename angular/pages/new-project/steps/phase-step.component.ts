import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import type { Phase } from '@components/badge/phase-chip.component';
import { IconComponent } from '@components/icon/icon.component';
import { phaseProgress, phaseState } from '@features/projects/project-phases';
import { PHASES } from '@features/projects/projects.model';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { NewProjectForm } from '../new-project-form';
import { StepPanelComponent } from './step-panel.component';

interface PhaseOption {
  id: Phase;
  icon: string;
  tags: string[];
}

const PHASE_OPTIONS: PhaseOption[] = [
  { id: 'initial', icon: 'compass', tags: ['Meeting notes', 'BRD', 'Scope', 'Estimate', 'SOW'] },
  { id: 'release', icon: 'rocket', tags: ['Architecture', 'Scaffolding', 'Infra', 'CI/CD'] },
  { id: 'sdlc', icon: 'infinity', tags: ['Kanban', 'Worktree', 'E2E evidence', 'Pull request'] },
];

const PLAN_LABELS = { done: 'np.pv.done', current: 'np.pv.start', locked: 'np.pv.next' } as const;

@Component({
  selector: 'pc-np-phase-step',
  imports: [IconComponent, StepPanelComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-np-step-panel icon="route" [title]="'np.s2.t' | t" [description]="'np.s2.d' | t">
      <div class="opts" role="radiogroup">
        @for (option of options; track option.id) {
          <button
            type="button"
            class="opt"
            role="radio"
            [class.is-selected]="option.id === form.phase()"
            [attr.aria-checked]="option.id === form.phase()"
            [attr.data-testid]="'np-phase-' + option.id"
            (click)="form.setPhase(option.id)"
          >
            <span class="tick"><pc-icon name="check" [size]="12" [strokeWidth]="3" /></span>
            <span class="opt-ico" [class]="'opt-ico ' + option.id"><pc-icon [name]="option.icon" [size]="20" /></span>
            <h4>{{ 'np.phase.' + option.id + '.t' | t }}</h4>
            <p>{{ 'np.phase.' + option.id + '.d' | t }}</p>
            <span class="tags">
              @for (tag of option.tags; track tag) {
                <span class="tag">{{ tag }}</span>
              }
            </span>
          </button>
        }
      </div>

      <div>
        <div class="sub-title"><h5>{{ 'np.pv.title' | t }}</h5></div>
        <div class="pv">
          @for (phase of phases; track phase) {
            <div [class.is-start]="phase === form.phase()">
              <div class="bar"><i [style.width.%]="progress(phase)" [style.background]="'var(--phase-' + phase + ')'"></i></div>
              <b>{{ 'phase.' + phase | t }}</b>
              <span>{{ planLabel(phase) | t }}</span>
            </div>
          }
        </div>
      </div>
    </pc-np-step-panel>
  `,
})
export class PhaseStepComponent {
  protected readonly form = inject(NewProjectForm);

  protected readonly options = PHASE_OPTIONS;
  protected readonly phases = PHASES;

  protected progress(phase: Phase): number {
    return phaseProgress(this.form.phase(), phase);
  }

  protected planLabel(phase: Phase): string {
    return PLAN_LABELS[phaseState(this.form.phase(), phase)];
  }
}
