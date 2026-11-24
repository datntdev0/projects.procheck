import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SETTINGS_SECTION } from '../../settings/settings-section.component';
import { ProjectSettingsForm } from '../project-settings-form';

const CODE_MAX_LENGTH = 6;

/** General: identity of the project and its linked repository, saved to `procheck.json` through the save bar. */
@Component({
  selector: 'pc-project-general-section',
  imports: [ButtonComponent, IconComponent, InputDirective, TooltipDirective, TranslatePipe, ...SETTINGS_SECTION],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="general" [title]="'ps.n.general' | t" [description]="'ps.general.d' | t">
      <div class="card">
        <pc-setting-row [label]="'ps.g.name' | t">
          <input
            pcInput
            data-testid="ps-name"
            [invalid]="form.nameMissing()"
            [value]="form.value().name"
            (input)="form.patch({ name: text($event) })"
          />
        </pc-setting-row>

        <pc-setting-row [label]="'ps.g.client' | t">
          <input pcInput data-testid="ps-client" [value]="form.value().client" (input)="form.patch({ client: text($event) })" />
        </pc-setting-row>

        <pc-setting-row [label]="'ps.g.code' | t" [description]="'ps.g.code.d' | t">
          <input
            pcInput
            class="mono code-input"
            data-testid="ps-code"
            [attr.maxlength]="codeMaxLength"
            [value]="form.value().code"
            (input)="form.patch({ code: text($event).toUpperCase() })"
          />
        </pc-setting-row>

        <div class="srow stack">
          <div class="sinfo">
            <div class="slabel">{{ 'ps.g.desc' | t }}</div>
            <div class="sdesc">{{ 'ps.g.desc.d' | t }}</div>
          </div>
          <textarea
            pcInput
            data-testid="ps-description"
            [placeholder]="'ps.g.desc.ph' | t"
            [value]="form.value().description"
            (input)="form.patch({ description: text($event) })"
          ></textarea>
        </div>

        <pc-setting-row [label]="'ps.g.repo' | t" [description]="'ps.g.repo.d' | t">
          @if (repoNote(); as note) {
            <div pcSettingDescription class="sdesc repo-note" [class.is-warning]="!form.value().repository" data-testid="ps-repo-note">{{ note }}</div>
          }
          <div class="ro" [class.is-empty]="!form.value().repository" data-testid="ps-repo">
            <pc-icon name="folder-git-2" [size]="14" />
            <span [title]="form.value().repository">{{ form.value().repository || ('ps.nonerepo' | t) }}</span>
          </div>
          <button pcButton type="button" data-testid="ps-repo-browse" [disabled]="form.repoChecking()" (click)="browseRepository()">
            <pc-icon [name]="form.repoChecking() ? 'refresh-cw' : 'folder-open'" />
            {{ (form.value().repository ? 'ps.change' : 'ps.link') | t }}
          </button>
          @if (form.value().repository && !form.repoRequired()) {
            <button
              pcButton
              variant="ghost"
              type="button"
              [iconOnly]="true"
              data-testid="ps-repo-unlink"
              [pcTooltip]="'ps.unlink' | t"
              (click)="form.unlinkRepository()"
            >
              <pc-icon name="unlink" />
            </button>
          }
        </pc-setting-row>
      </div>
    </pc-settings-section>
  `,
})
export class ProjectGeneralSectionComponent {
  protected readonly form = inject(ProjectSettingsForm);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly codeMaxLength = CODE_MAX_LENGTH;

  protected readonly repoNote = computed(() => {
    const info = this.form.repoInfo();
    if (info) {
      const branch = info.branch ?? this.i18n.t('np.repo.detached');
      const tree = this.i18n.t(info.clean === false ? 'np.repo.dirty' : 'np.repo.clean');
      return this.i18n.t('np.repo.ok', { branch, tree });
    }
    return !this.form.value().repository && this.form.repoRequired() ? this.i18n.t('ps.repo.required') : '';
  });

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected async browseRepository(): Promise<void> {
    try {
      const info = await this.form.browseRepository();
      if (info && info.status !== 'ready') {
        this.toast.show(this.i18n.t(`np.repo.err.${info.status}`), { icon: 'circle-alert', tone: 'danger', duration: 6000 });
      }
    } catch {
      this.toast.show(this.i18n.t('set.browse.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }
}
