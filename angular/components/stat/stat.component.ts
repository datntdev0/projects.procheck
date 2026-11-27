import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * One labelled figure. Put several in a `pc-stat-strip`, not one card each:
 * ```html
 * <pc-stat-strip [cols]="4"><pc-stat label="Files" value="6" />…</pc-stat-strip>
 * ```
 */
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
    @if (sub()) {
      <span class="stat-sub">{{ sub() }}</span>
    }
  `,
})
export class StatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly delta = input('');
  /** Secondary line under the value (context, not a trend). */
  readonly sub = input('');
  readonly trend = input<'up' | 'down' | 'neutral'>('neutral');
  protected readonly deltaClass = computed(
    () => 'stat-delta ' + ({ up: 'text-success', down: 'text-danger', neutral: 'text-subtle' } as const)[this.trend()],
  );
}

/** A single bordered row of figures divided by rules (replaces a grid of stat cards). */
@Component({
  selector: 'pc-stat-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'stat-strip', '[style.--cols]': 'cols()' },
  template: `<ng-content />`,
})
export class StatStripComponent {
  readonly cols = input(4);
}
