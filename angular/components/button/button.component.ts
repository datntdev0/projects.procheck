import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * `ai` is a secondary button with a brand sparkle; use `ai-primary` only when the AI action is the
 * view's main action (one primary button per view).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'ai' | 'ai-primary';
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
      this.variant() === 'ai-primary' ? 'btn-ai is-primary' : `btn-${this.variant()}`,
      this.size() !== 'md' ? `btn-${this.size()}` : '',
      this.iconOnly() ? 'btn-icon' : '',
      this.block() ? 'btn-block' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
