import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

/** Horizontal step indicator for wizards and phases. `current` is the 0-based active step. */
@Component({
  selector: 'pc-stepper',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'stepper' },
  template: `
    @for (step of steps(); track $index; let i = $index, last = $last) {
      <div class="step" [class.is-done]="i < current()" [class.is-current]="i === current()" [attr.aria-current]="i === current() ? 'step' : null">
        <span class="step-index">
          @if (i < current()) {
            <pc-icon name="check" [size]="13" [strokeWidth]="2.5" />
          } @else {
            {{ i + 1 }}
          }
        </span>
        {{ step }}
      </div>
      @if (!last) {
        <span class="step-line" [class.is-done]="i < current()"></span>
      }
    }
  `,
})
export class StepperComponent {
  readonly steps = input.required<string[]>();
  readonly current = input(0);
}
