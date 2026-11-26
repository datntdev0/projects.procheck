import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  count?: number | string;
}

/** Underlined tab bar. Renders only the bar; the page switches content on `active`. */
@Component({
  selector: 'pc-tabs',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tabs', role: 'tablist' },
  template: `
    @for (tab of items(); track tab.id) {
      <button
        type="button"
        class="tab"
        role="tab"
        [class.is-active]="tab.id === active()"
        [attr.aria-selected]="tab.id === active()"
        (click)="active.set(tab.id)"
      >
        @if (tab.icon) {
          <pc-icon [name]="tab.icon" [size]="14" />
        }
        {{ tab.label }}
        @if (tab.count !== undefined) {
          <span class="count">{{ tab.count }}</span>
        }
      </button>
    }
  `,
})
export class TabsComponent {
  readonly items = input.required<TabItem[]>();
  readonly active = model<string>('');
}
