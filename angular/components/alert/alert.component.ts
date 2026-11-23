import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'ai';

const ICONS: Record<AlertTone, string> = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-alert',
  ai: 'sparkles',
};

@Component({
  selector: 'pc-alert',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', role: 'status' },
  template: `
    <pc-icon [name]="icon() || defaultIcon()" [style.color]="tone() === 'ai' ? 'var(--accent-purple)' : null" style="margin-top: 2px" />
    <div class="grow">
      @if (title()) {
        <div class="h5" style="margin-bottom: 2px">{{ title() }}</div>
      }
      <div class="text-sm text-muted"><ng-content /></div>
    </div>
    <ng-content select="[pcAlertActions]" />
  `,
})
export class AlertComponent {
  readonly tone = input<AlertTone>('info');
  readonly title = input('');
  readonly icon = input('');

  protected readonly defaultIcon = computed(() => ICONS[this.tone()]);
  protected readonly classes = computed(() => `alert alert-${this.tone()}`);
}
