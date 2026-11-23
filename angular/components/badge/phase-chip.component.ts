import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Project lifecycle phase. `release` is labelled "Scaffolding" in the UI. */
export type Phase = 'initial' | 'release' | 'sdlc';

@Component({
  selector: 'pc-phase-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class PhaseChipComponent {
  readonly phase = input.required<Phase>();
  protected readonly classes = computed(() => `phase-chip phase-${this.phase()}`);
}
