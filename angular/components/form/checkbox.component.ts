import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'pc-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex' },
  template: `
    <label class="checkbox">
      <input type="checkbox" [checked]="checked()" [disabled]="disabled()" (change)="checked.set($any($event.target).checked)" />
      <ng-content />
    </label>
  `,
})
export class CheckboxComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
}
