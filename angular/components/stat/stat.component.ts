import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'pc-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'stat' },
  template: `
    <span class="stat-label">{{ label() }}</span>
    <span class="stat-value">{{ value() }}</span>
    @if (delta()) {
      <span class="stat-delta" [class]="deltaClass()">{{ delta() }}</span>
    }
  `,
})
export class StatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly delta = input('');
  readonly trend = input<'up' | 'down' | 'neutral'>('neutral');
  protected readonly deltaClass = computed(
    () => 'stat-delta ' + ({ up: 'text-success', down: 'text-danger', neutral: 'text-subtle' } as const)[this.trend()],
  );
}
