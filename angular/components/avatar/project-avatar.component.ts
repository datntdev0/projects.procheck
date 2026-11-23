import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Square project monogram, e.g. "LP" for Lotus Pay. */
@Component({
  selector: 'pc-project-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'project-avatar',
    '[style.background]': 'color() || null',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.border-radius.px]': 'radius()',
    '[style.font-size.px]': 'fontSize()',
  },
  template: `{{ short() }}`,
})
export class ProjectAvatarComponent {
  readonly short = input.required<string>();
  /** Any CSS background; defaults to the brand gradient. */
  readonly color = input<string>('');
  readonly size = input(32);

  protected readonly radius = computed(() => Math.round(this.size() / 4));
  protected readonly fontSize = computed(() => Math.max(9, Math.round(this.size() * 0.36)));
}
