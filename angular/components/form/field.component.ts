import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Label + control + hint/error. Project the control (e.g. `<input pcInput [id]="…">`). */
@Component({
  selector: 'pc-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'field' },
  template: `
    @if (label()) {
      <label class="label" [attr.for]="for() || null">{{ label() }}</label>
    }
    <ng-content />
    @if (error()) {
      <span class="hint text-danger" role="alert">{{ error() }}</span>
    } @else if (hint()) {
      <span class="hint">{{ hint() }}</span>
    }
  `,
})
export class FieldComponent {
  readonly label = input('');
  /** id of the projected control. */
  readonly for = input('');
  readonly hint = input('');
  readonly error = input('');
}
