import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

/** Centered placeholder for empty lists and not-yet-built pages. Project actions as content. */
@Component({
  selector: 'pc-empty-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'empty' },
  template: `
    <div class="empty-icon"><pc-icon [name]="icon()" [size]="22" /></div>
    <h4>{{ title() }}</h4>
    @if (description()) {
      <p class="text-sm" style="max-width: 420px; margin: 0">{{ description() }}</p>
    }
    <div class="row" style="margin-top: var(--space-2)"><ng-content /></div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly description = input('');
}
