import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: string;
}

/** Small exclusive toggle group (e.g. Ask / Edit / Agent, Light / Dark / System). */
@Component({
  selector: 'pc-segmented',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'segmented', role: 'radiogroup' },
  template: `
    @for (opt of options(); track opt.value) {
      <button
        type="button"
        role="radio"
        [class.is-active]="opt.value === value()"
        [attr.aria-checked]="opt.value === value()"
        (click)="value.set(opt.value)"
      >
        @if (opt.icon) {
          <pc-icon [name]="opt.icon" [size]="14" />
        }
        {{ opt.label }}
      </button>
    }
  `,
})
export class SegmentedComponent {
  readonly options = input.required<SegmentedOption[]>();
  readonly value = model<string>('');
}
