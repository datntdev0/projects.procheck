import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'ai';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** `<button pcButton variant="primary">` — also works on `<a>`. */
@Component({
  selector: 'button[pcButton], a[pcButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  /** Square button that only holds an icon (give it an aria-label). */
  readonly iconOnly = input(false);
  readonly block = input(false);

  protected readonly classes = computed(() =>
    [
      'btn',
      `btn-${this.variant()}`,
      this.size() !== 'md' ? `btn-${this.size()}` : '',
      this.iconOnly() ? 'btn-icon' : '',
      this.block() ? 'btn-block' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
