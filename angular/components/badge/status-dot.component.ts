import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type DotTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple' | 'teal';

@Component({
  selector: 'pc-status-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', role: 'presentation' },
  template: ``,
})
export class StatusDotComponent {
  readonly tone = input<DotTone>('neutral');
  /** Animated "live" ring (success colour). */
  readonly pulse = input(false);
  protected readonly classes = computed(() =>
    ['dot', this.tone() !== 'neutral' ? `dot-${this.tone()}` : '', this.pulse() ? 'dot-pulse' : ''].filter(Boolean).join(' '),
  );
}
