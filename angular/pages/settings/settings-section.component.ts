import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One section of the settings page: heading, optional description, then the projected body.
 * The host carries the section id so the in-page navigation can scroll to it.
 * ```html
 * <pc-settings-section sectionId="general" [title]="…" [description]="…">
 *   <div pcSettingsSectionActions>…</div>
 *   <pc-card>…</pc-card>
 * </pc-settings-section>
 * ```
 */
@Component({
  selector: 'pc-settings-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sec',
    '[id]': 'sectionId()',
    '[attr.data-sec]': 'sectionId()',
    '[attr.data-testid]': "'settings-section-' + sectionId()",
  },
  template: `
    <div class="sec-head">
      <div>
        <h2>{{ title() }}</h2>
        @if (description()) {
          <p>{{ description() }}</p>
        }
      </div>
      <ng-content select="[pcSettingsSectionActions]" />
    </div>
    <ng-content />
  `,
})
export class SettingsSectionComponent {
  readonly sectionId = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input('');
}

/** A label / description on the left and a control on the right, inside a settings card. */
@Component({
  selector: 'pc-setting-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'srow' },
  template: `
    <div class="sinfo">
      <div class="slabel">{{ label() }}</div>
      @if (description()) {
        <div class="sdesc">{{ description() }}</div>
      }
      <ng-content select="[pcSettingDescription]" />
    </div>
    <div class="sctl"><ng-content /></div>
  `,
})
export class SettingRowComponent {
  readonly label = input.required<string>();
  readonly description = input('');
}

export const SETTINGS_SECTION = [SettingsSectionComponent, SettingRowComponent] as const;
