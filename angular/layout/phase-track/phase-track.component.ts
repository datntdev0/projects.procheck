import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Phase, PhaseChipComponent } from '@components/badge/phase-chip.component';
import { phaseProgress } from '@features/projects/project-phases';
import { PHASES } from '@features/projects/projects.model';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

/** Three bars, one per phase: earlier phases full, the current one partly filled. */
@Component({
  selector: 'pc-phase-track',
  imports: [PhaseChipComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'phase-track', 'data-testid': 'phase-track' },
  template: `
    <div class="row between">
      <span class="text-xs text-muted">{{ label() | t }}</span>
      <pc-phase-chip [phase]="phase()">{{ 'phase.' + phase() | t }}</pc-phase-chip>
    </div>
    <div class="bars">
      @for (bar of bars(); track bar.phase) {
        <span [attr.aria-label]="('phase.' + bar.phase | t) + ' ' + bar.value + '%'">
          <i [style.width.%]="bar.value" [style.background]="'var(--phase-' + bar.phase + ')'"></i>
        </span>
      }
    </div>
    <div class="labels">
      @for (bar of bars(); track bar.phase) {
        <span>
          {{ 'phase.' + bar.phase | t }}
          @if (showValues()) {
            <b>{{ bar.value }}%</b>
          }
        </span>
      }
    </div>
  `,
})
export class PhaseTrackComponent {
  readonly phase = input.required<Phase>();
  readonly label = input<string>('nav.workflow');
  readonly showValues = input(false);

  protected readonly bars = computed(() => PHASES.map((phase) => ({ phase, value: phaseProgress(this.phase(), phase) })));
}
