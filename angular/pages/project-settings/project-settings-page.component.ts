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
import { ProjectSettingsForm } from './project-settings-form';
import { ProjectDangerSectionComponent } from './sections/project-danger-section.component';
import { ProjectGeneralSectionComponent } from './sections/project-general-section.component';

export type ProjectSettingsSectionId = 'general' | 'danger';

interface ProjectSettingsNavItem {
  id: ProjectSettingsSectionId;
  label: TranslationKey;
  icon: string;
}

const NAV: ProjectSettingsNavItem[] = [
  { id: 'general', label: 'ps.n.general', icon: 'sliders-horizontal' },
  { id: 'danger', label: 'ps.n.danger', icon: 'triangle-alert' },
];

const MANIFEST_FILE = 'procheck.json';

/** Save errors (`projects_update` codes) with a dedicated message. */
const SAVE_ERRORS: Partial<Record<string, TranslationKey>> = {
  nameRequired: 'ps.save.name',
  repositoryRequired: 'ps.repo.required',
  invalidRepository: 'ps.save.repo',
};

/** Project settings (ported from _proto/project-settings.html): General and Danger zone. */
@Component({
  selector: 'pc-project-settings-page',
  imports: [
    ButtonComponent,
    IconComponent,
    ProjectAvatarComponent,
    ProjectDangerSectionComponent,
    ProjectGateComponent,
    ProjectGeneralSectionComponent,
    RouterLink,
    TranslatePipe,
  ],
  providers: [ProjectSettingsForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-settings-page.component.html',
})
export class ProjectSettingsPageComponent {
  protected readonly form = inject(ProjectSettingsForm);
  protected readonly actions = inject(ProjectActionsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

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

  protected async save(): Promise<void> {
    const result = await this.form.save();
    if (result.ok) {
      this.toast.show(this.i18n.t('ps.saved'), { tone: 'success' });
      return;
    }
    const known = result.code ? SAVE_ERRORS[result.code] : undefined;
    const message = known ? this.i18n.t(known) : this.i18n.t('ps.save.failed', { reason: result.message });
    this.toast.show(message, { icon: 'circle-alert', tone: 'danger', duration: 6000 });
    this.go('general');
  }

  protected discard(): void {
    this.form.discard();
    this.toast.show(this.i18n.t('set.discarded'), { icon: 'undo-2' });
  }
}
