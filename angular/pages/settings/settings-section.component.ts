import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One section of the settings page: a single flat panel whose head carries the title, optional description
 * and group action; the projected body (setting rows, ruled sections) sits directly inside the panel.
 * The host carries the section id so the in-page navigation can scroll to it.
 * ```html
 * <pc-settings-section sectionId="general" [title]="…" [description]="…">
 *   <div pcSettingsSectionActions>…</div>
 *   <pc-setting-row …>…</pc-setting-row>
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
    <div class="card sec-panel">
      <div class="panel-head">
        <div class="sec-t">
          <h2>{{ title() }}</h2>
          @if (description()) {
            <p>{{ description() }}</p>
          }
        </div>
        <ng-content select="[pcSettingsSectionActions]" />
      </div>
      <ng-content />
    </div>
  `,
})
export class SettingsSectionComponent {
  readonly sectionId = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input('');
}

/** A ruled row inside a settings panel: label / description on the left, control on the right. */
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
