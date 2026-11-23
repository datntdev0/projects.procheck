import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'pc-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "ai() ? 'progress progress-ai' : 'progress'",
    style: 'display: block',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'clamped()',
  },
  template: `<span [style.width.%]="clamped()" [style.background]="color() || null"></span>`,
})
export class ProgressComponent {
  /** 0–100. */
  readonly value = input(0);
  /** AI gradient fill. */
  readonly ai = input(false);
  /** Custom fill colour, e.g. `var(--phase-sdlc)`. */
  readonly color = input('');
  protected readonly clamped = computed(() => Math.max(0, Math.min(100, this.value())));
}

@Component({
  selector: 'pc-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'spinner', role: 'status', 'aria-label': 'Loading' },
  template: ``,
})
export class SpinnerComponent {}

@Component({
  selector: 'pc-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'skeleton', style: 'display: block', '[style.width]': 'width()', '[style.height]': 'height()' },
  template: ``,
})
export class SkeletonComponent {
  readonly width = input('100%');
  readonly height = input('12px');
}
