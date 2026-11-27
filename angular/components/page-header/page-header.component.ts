import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Flat page title row: kicker, title, meta line and actions, closed by a bottom rule.
 * No hero panel, gradient or icon tile. Project extra meta with `[pcPageMeta]` and actions with `[pcPageActions]`.
 */
@Component({
  selector: 'pc-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page-head' },
  template: `
    <div class="grow">
      @if (kicker()) {
        <div class="kicker" style="margin-bottom: 4px">{{ kicker() }}</div>
      }
      <h1>{{ title() }}</h1>
      <div class="meta">
        @if (subtitle()) {
          <span>{{ subtitle() }}</span>
        }
        <ng-content select="[pcPageMeta]" />
      </div>
    </div>
    <div class="actions"><ng-content select="[pcPageActions]" /></div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly kicker = input('');
}
