import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { projectMonogram } from '@features/projects/project-phases';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ProjectActionsService } from '../project/project-actions.service';
import { ProjectGateComponent } from '../project/project-gate.component';
import { SectionSpy } from '../settings/section-spy';
import { ProjectCustomizationForm } from './project-customization-form';
import { ProjectSettingsForm } from './project-settings-form';
import { ProjectDangerSectionComponent } from './sections/project-danger-section.component';
import { CustomizationSectionComponent } from './sections/customization/customization-section.component';
import { ProjectGeneralSectionComponent } from './sections/project-general-section.component';

export type ProjectSettingsSectionId = 'general' | 'customize' | 'danger';

interface ProjectSettingsNavItem {
  id: ProjectSettingsSectionId;
  label: TranslationKey;
  icon: string;
}

const NAV: ProjectSettingsNavItem[] = [
  { id: 'general', label: 'ps.n.general', icon: 'sliders-horizontal' },
  { id: 'customize', label: 'ps.n.cz', icon: 'wand-sparkles' },
  { id: 'danger', label: 'ps.n.danger', icon: 'triangle-alert' },
];

const MANIFEST_FILE = 'procheck.json';

/** Save errors (`projects_customization_save` codes) with a dedicated message. */
const CUSTOMIZATION_SAVE_ERRORS: Partial<Record<string, TranslationKey>> = {
  templateType: 'ps.cz.save.type',
  templateTooLarge: 'ps.cz.save.size',
  invalidCustomization: 'ps.cz.save.invalid',
  notSupported: 'ps.cz.save.unsupported',
};

/** Save errors (`projects_update` codes) with a dedicated message. */
const SAVE_ERRORS: Partial<Record<string, TranslationKey>> = {
  nameRequired: 'ps.save.name',
  repositoryRequired: 'ps.repo.required',
  invalidRepository: 'ps.save.repo',
};

/** Project settings (ported from _proto/project-settings.html): General, Customization (per phase) and Danger zone. */
@Component({
  selector: 'pc-project-settings-page',
  imports: [
    ButtonComponent,
    CustomizationSectionComponent,
    IconComponent,
    ProjectAvatarComponent,
    ProjectDangerSectionComponent,
    ProjectGateComponent,
    ProjectGeneralSectionComponent,
    RouterLink,
    TranslatePipe,
  ],
  providers: [ProjectSettingsForm, ProjectCustomizationForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-settings-page.component.html',
})
export class ProjectSettingsPageComponent {
  protected readonly form = inject(ProjectSettingsForm);
  protected readonly customization = inject(ProjectCustomizationForm);
  protected readonly actions = inject(ProjectActionsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  /** Unsaved edits in General or in Customization: one save bar for both. */
  protected readonly dirty = computed(() => this.form.dirty() || this.customization.dirty());
  protected readonly saving = computed(() => this.form.saving() || this.customization.saving());
  protected readonly cannotSave = computed(() => (this.form.dirty() && this.form.nameMissing()) || this.customization.invalid());

  protected readonly nav = NAV;
  private readonly sections = new SectionSpy<ProjectSettingsSectionId>(NAV.map((item) => item.id));
  protected readonly active = this.sections.active;

  protected readonly monogram = computed(() => {
    const manifest = this.form.project()?.manifest;
    return manifest ? projectMonogram(manifest.name, manifest.code) : '';
  });
  protected readonly manifestFile = computed(() => `${(this.form.project()?.dir ?? '').replace(/[\\/]+$/, '')}\\${MANIFEST_FILE}`);

  protected go(id: ProjectSettingsSectionId): void {
    this.sections.go(id);
  }

  /** Saves General (`procheck.json`), then Customization (`.procheck\settings.json`); each discards its own edits once saved. */
  protected async save(): Promise<void> {
    const savingGeneral = this.form.dirty();
    const savingCustomization = this.customization.dirty();

    if (savingGeneral) {
      const result = await this.form.save();
      if (!result.ok) {
        const known = result.code ? SAVE_ERRORS[result.code] : undefined;
        this.reportFailure(known ? this.i18n.t(known) : this.i18n.t('ps.save.failed', { reason: result.message }));
        this.go('general');
        return;
      }
    }
    if (savingCustomization) {
      const result = await this.customization.save();
      if (!result.ok) {
        const known = result.code ? CUSTOMIZATION_SAVE_ERRORS[result.code] : undefined;
        this.reportFailure(known ? this.i18n.t(known) : this.i18n.t('ps.cz.save.failed', { reason: result.message }));
        this.go('customize');
        return;
      }
    }
    const saved: TranslationKey = savingGeneral ? (savingCustomization ? 'ps.saved.both' : 'ps.saved') : 'ps.cz.saved';
    this.toast.show(this.i18n.t(saved), { tone: 'success' });
  }

  private reportFailure(message: string): void {
    this.toast.show(message, { icon: 'circle-alert', tone: 'danger', duration: 6000 });
  }

  protected discard(): void {
    this.form.discard();
    this.customization.discard();
    this.toast.show(this.i18n.t('set.discarded'), { icon: 'undo-2' });
  }
}
