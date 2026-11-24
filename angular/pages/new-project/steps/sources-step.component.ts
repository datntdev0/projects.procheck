import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { AlertComponent } from '@components/alert/alert.component';
import { BadgeComponent } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { FileKind, FileTileComponent } from '@components/file-tile/file-tile.component';
import { FieldComponent } from '@components/form/field.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { SpinnerComponent } from '@components/progress/progress.component';
import { ProjectsService } from '@features/projects/projects.service';
import { formatBytes } from '@shared/format/bytes';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { NewProjectForm } from '../new-project-form';
import { StepPanelComponent } from './step-panel.component';

const FILE_KINDS: Record<string, FileKind> = {
  pdf: 'pdf',
  docx: 'doc',
  xlsx: 'sheet',
  csv: 'sheet',
  md: 'md',
  markdown: 'md',
  vtt: 'audio',
  srt: 'audio',
};

export function fileKind(name: string): FileKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_KINDS[extension] ?? 'doc';
}

@Component({
  selector: 'pc-np-sources-step',
  imports: [
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    FieldComponent,
    FileTileComponent,
    IconComponent,
    InputDirective,
    SpinnerComponent,
    StepPanelComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-np-step-panel icon="folder-input" [title]="'np.s3.t' | t" [description]="'np.s3.d' | t">
      <div>
        <button type="button" class="dropzone" data-testid="np-dropzone" [class.is-over]="dragOver()" (click)="form.browseSources()">
          <span class="dz-ico"><pc-icon name="upload" [size]="20" /></span>
          <b class="dz-title">{{ 'np.drop.t' | t }}</b>
          <span class="text-xs">{{ 'np.drop.d' | t }}</span>
        </button>
        <div class="sub-title mt-4"><h5>{{ 'np.files.title' | t }}</h5></div>
        <div class="flist" data-testid="np-files">
          @for (file of form.sources(); track file.path) {
            <div class="fitem">
              <pc-file-tile [kind]="kind(file.name)" />
              <div class="grow" style="min-width: 0">
                <div class="fname truncate">{{ file.name }}</div>
                <div class="fmeta truncate" [title]="file.path">{{ size(file.bytes) }} · {{ file.path }}</div>
              </div>
              <button pcButton variant="ghost" size="sm" [iconOnly]="true" [attr.aria-label]="'np.file.remove' | t" (click)="form.removeSource(file.path)">
                <pc-icon name="x" />
              </button>
            </div>
          } @empty {
            <div class="flist-empty">{{ 'np.files.empty' | t }}</div>
          }
        </div>
      </div>

      <pc-field [error]="repoError()" [hint]="(form.repoRequired() ? 'np.repo.hint.req' : 'np.repo.hint.opt') | t">
        <div class="sub-title" style="margin-bottom: 0">
          <label class="label" for="np-repo">{{ 'np.repo.title' | t }}</label>
          <pc-badge [tone]="form.repoRequired() ? 'warning' : 'neutral'">{{ (form.repoRequired() ? 'np.repo.req' : 'np.repo.opt') | t }}</pc-badge>
        </div>
        <div class="dir-row">
          <div class="input-group grow">
            <pc-icon name="folder-git-2" />
            <input
              pcInput
              id="np-repo"
              class="mono"
              autocomplete="off"
              spellcheck="false"
              data-testid="np-repo"
              [invalid]="!!repoError()"
              [placeholder]="'np.repo.ph' | t"
              [value]="form.repository()"
              (input)="form.setRepository(value($event))"
              (blur)="form.inspectRepository()"
            />
          </div>
          <button pcButton type="button" (click)="form.browseRepository()"><pc-icon name="folder-open" /> {{ 'np.browse' | t }}</button>
        </div>
      </pc-field>
      @if (form.repoChecking()) {
        <div class="row text-sm text-muted"><pc-spinner /> {{ 'np.repo.checking' | t }}</div>
      } @else if (form.repoReady()) {
        <pc-alert tone="success" data-testid="np-repo-ok">
          {{ repoSummary() }}
          @if (repoRoot()) {
            <div class="mono text-xs">{{ repoRoot() }}</div>
          }
        </pc-alert>
      }
    </pc-np-step-panel>
  `,
})
export class SourcesStepComponent {
  protected readonly form = inject(NewProjectForm);
  private readonly projects = inject(ProjectsService);
  private readonly i18n = inject(I18nService);

  protected readonly dragOver = signal(false);

  protected readonly repoError = computed(() => {
    const key = this.form.repoError();
    const show = this.form.attempted() || !!this.form.repoInfo();
    return key && show ? this.i18n.t(key) : '';
  });

  protected readonly repoSummary = computed(() => {
    const info = this.form.repoInfo();
    if (!info) return '';
    const branch = info.branch ?? this.i18n.t('np.repo.detached');
    const tree = this.i18n.t(info.clean === false ? 'np.repo.dirty' : 'np.repo.clean');
    return this.i18n.t('np.repo.ok', { branch, tree });
  });

  protected readonly repoRoot = computed(() => {
    const info = this.form.repoInfo();
    const root = info?.root;
    return root && root.toLowerCase() !== info.path.trim().toLowerCase() ? this.i18n.t('np.repo.root', { root }) : '';
  });

  constructor() {
    const subscription = this.projects.onFileDrop(
      (paths) => void this.form.dropSources(paths),
      (over) => this.dragOver.set(over),
    );
    inject(DestroyRef).onDestroy(() => void subscription.then((unlisten) => unlisten()));
  }

  protected kind(name: string): FileKind {
    return fileKind(name);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
