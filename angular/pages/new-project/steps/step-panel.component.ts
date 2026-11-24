import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '@components/icon/icon.component';

@Component({
  selector: 'pc-np-step-panel',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-head">
      <span class="ph-ico"><pc-icon [name]="icon()" [size]="20" /></span>
      <div>
        <h4>{{ title() }}</h4>
        <p>{{ description() }}</p>
      </div>
    </div>
    <div class="panel-body"><ng-content /></div>
  `,
})
export class StepPanelComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input('');
}
