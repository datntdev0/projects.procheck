import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Keyboard key hint: `<pc-kbd>Ctrl K</pc-kbd>`. */
@Component({
  selector: 'pc-kbd',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'kbd' },
  template: `<ng-content />`,
})
export class KbdComponent {}
