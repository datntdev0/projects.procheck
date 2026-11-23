import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export type AvatarSize = 'sm' | 'md' | 'lg';

/** Person ("You") or AI avatar. AI avatars use the AI gradient and a sparkles glyph. */
@Component({
  selector: 'pc-avatar',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `
    @if (ai()) {
      <pc-icon [name]="icon()" [size]="iconSize()" />
    } @else {
      {{ initials() }}
    }
  `,
})
export class AvatarComponent {
  readonly initials = input('');
  readonly size = input<AvatarSize>('md');
  readonly ai = input(false);
  readonly icon = input('sparkles');

  protected readonly iconSize = computed(() => ({ sm: 11, md: 13, lg: 18 })[this.size()]);
  protected readonly classes = computed(() =>
    ['avatar', this.size() !== 'md' ? `avatar-${this.size()}` : '', this.ai() ? 'avatar-ai' : ''].filter(Boolean).join(' '),
  );
}
