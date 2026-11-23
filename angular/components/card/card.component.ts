import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Surface container.
 * ```html
 * <pc-card>
 *   <pc-card-header>Title</pc-card-header>
 *   <pc-card-body>…</pc-card-body>
 *   <pc-card-footer>…</pc-card-footer>
 * </pc-card>
 * ```
 * Use `padded` for a simple card without header/body/footer.
 */
@Component({
  selector: 'pc-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', '[style.--_accent]': 'accent() || null' },
  template: `<ng-content />`,
})
export class CardComponent {
  readonly padded = input(false);
  readonly interactive = input(false);
  readonly flat = input(false);
  /** Left accent bar colour (CSS colour / var). */
  readonly accent = input<string>('');

  protected readonly classes = computed(() =>
    [
      'card',
      this.padded() ? 'card-pad' : '',
      this.interactive() ? 'card-interactive' : '',
      this.flat() ? 'card-flat' : '',
      this.accent() ? 'card-accent' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}

@Component({
  selector: 'pc-card-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card-header' },
  template: `<ng-content />`,
})
export class CardHeaderComponent {}

@Component({
  selector: 'pc-card-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card-body', style: 'display: block' },
  template: `<ng-content />`,
})
export class CardBodyComponent {}

@Component({
  selector: 'pc-card-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card-footer' },
  template: `<ng-content />`,
})
export class CardFooterComponent {}

export const CARD = [CardComponent, CardHeaderComponent, CardBodyComponent, CardFooterComponent] as const;
