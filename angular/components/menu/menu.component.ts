import { ChangeDetectionStrategy, Component, Directive, input } from '@angular/core';

/** Menu surface. Static by default; `pc-dropdown` positions it under a trigger. */
@Component({
  selector: 'pc-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'menu', role: 'menu', style: 'position: static; display: block' },
  template: `<ng-content />`,
})
export class MenuComponent {}

/** `<button pcMenuItem>` row inside a `pc-menu`. */
@Directive({
  selector: 'button[pcMenuItem], a[pcMenuItem]',
  host: { class: 'menu-item', role: 'menuitem', '[class.is-active]': 'active()' },
})
export class MenuItemDirective {
  readonly active = input(false);
}

@Component({
  selector: 'pc-menu-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'menu-label', style: 'display: block' },
  template: `<ng-content />`,
})
export class MenuLabelComponent {}

@Component({
  selector: 'pc-menu-separator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'menu-sep', role: 'separator', style: 'display: block' },
  template: ``,
})
export class MenuSeparatorComponent {}

export const MENU = [MenuComponent, MenuItemDirective, MenuLabelComponent, MenuSeparatorComponent] as const;
