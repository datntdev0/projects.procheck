import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';
import { PhaseChipComponent } from '@components/badge/phase-chip.component';
import { IconComponent } from '@components/icon/icon.component';
import { AGENT_NAMES } from '@features/agents/agents.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { NewProjectForm } from './new-project-form';

interface SummaryRow {
  icon: string;
  label: TranslationKey;
  value: string;
  mono?: boolean;
}

@Component({
  selector: 'pc-np-summary',
  imports: [IconComponent, PhaseChipComponent, ProjectAvatarComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'aside' },
  template: `
    <div class="card" style="overflow: hidden">
      <div class="sum-head">
        <pc-project-avatar [short]="form.monogram()" [size]="40" />
        <div class="grow" style="min-width: 0">
          <div class="h5 truncate">{{ form.name().trim() || ('np.sum.untitled' | t) }}</div>
          <div class="text-xs text-subtle truncate">{{ form.client().trim() || ('np.sum.client' | t) }}</div>
        </div>
      </div>
      <div class="sum-rows">
        <div class="sum-row">
          <span class="k"><pc-icon name="route" [size]="13" />{{ 'np.sum.phase' | t }}</span>
          <pc-phase-chip [phase]="form.phase()">{{ 'phase.' + form.phase() | t }}</pc-phase-chip>
        </div>
        @for (row of rows(); track row.label) {
          <div class="sum-row">
            <span class="k"><pc-icon [name]="row.icon" [size]="13" />{{ row.label | t }}</span>
            <span class="v truncate" [class.mono]="row.mono" [title]="row.value">{{ row.value }}</span>
          </div>
        }
      </div>
    </div>
    <div class="card tip-card">
      <pc-icon name="lightbulb" [size]="16" />
      <span>{{ 'np.tip.' + form.step() | t }}</span>
    </div>
  `,
})
export class NewProjectSummaryComponent {
  protected readonly form = inject(NewProjectForm);
  private readonly i18n = inject(I18nService);

  protected readonly rows = computed<SummaryRow[]>(() => {
    const repository = this.form.repository().trim();
    return [
      { icon: 'file-text', label: 'np.sum.docs', value: this.i18n.t('np.sum.docs.v', { n: this.form.sources().length }) },
      { icon: 'folder-git-2', label: 'np.sum.repo', value: repository || this.i18n.t('np.sum.none'), mono: !!repository },
      { icon: 'sparkles', label: 'np.sum.ai', value: AGENT_NAMES[this.form.cli()] },
      { icon: 'folder', label: 'np.sum.dir', value: this.form.dir().trim() || '—', mono: true },
    ];
  });
}
