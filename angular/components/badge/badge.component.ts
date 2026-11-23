import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'brand' | 'purple' | 'teal' | 'magenta' | 'success' | 'warning' | 'danger' | 'outline';

@Component({
  selector: 'pc-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  protected readonly classes = computed(() => (this.tone() === 'neutral' ? 'badge' : `badge badge-${this.tone()}`));
}
