import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'pc-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex' },
  template: `
    <label class="switch">
      <input
        type="checkbox"
        role="switch"
        [checked]="checked()"
        [disabled]="disabled()"
        [attr.aria-checked]="checked()"
        (change)="checked.set($any($event.target).checked)"
      />
      <ng-content />
    </label>
  `,
})
export class SwitchComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
}
