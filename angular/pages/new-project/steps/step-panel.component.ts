import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Head of one wizard step: title and description, no icon tile. Project the step body as
 * `.sec` blocks; consecutive sections are divided by rules (one level of containers).
 */
@Component({
  selector: 'pc-np-step-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sec-head">
      <h4>{{ title() }}</h4>
      @if (description()) {
        <p>{{ description() }}</p>
      }
    </div>
    <ng-content />
  `,
})
export class StepPanelComponent {
  readonly title = input.required<string>();
  readonly description = input('');
}
