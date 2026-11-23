import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

/**
 * Lucide icon by kebab-case name, e.g. `<pc-icon name="sparkles" />`.
 * Icons must be registered once via `provideAppIcons()` (see `@shared/icons/app-icons`).
 */
@Component({
  selector: 'pc-icon',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    'aria-hidden': 'true',
  },
  template: `<svg [lucideIcon]="name()" [strokeWidth]="strokeWidth()"></svg>`,
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(16);
  readonly strokeWidth = input<number>(1.75);
}
