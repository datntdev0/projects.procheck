import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page title block inside the canvas. Project actions with `[pcPageActions]`. */
@Component({
  selector: 'pc-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page-header' },
  template: `
    <div>
      @if (kicker()) {
        <div class="kicker" style="margin-bottom: 6px">{{ kicker() }}</div>
      }
      <h1>{{ title() }}</h1>
      @if (subtitle()) {
        <div class="subtitle">{{ subtitle() }}</div>
      }
    </div>
    <div class="row"><ng-content select="[pcPageActions]" /></div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly kicker = input('');
}
