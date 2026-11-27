import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { FieldComponent } from '@components/form/field.component';
import { InputDirective } from '@components/form/input.directive';
import { SegmentedComponent, SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { DocumentLanguage, INDUSTRIES } from '@features/projects/projects.model';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { NewProjectForm } from '../new-project-form';
import { StepPanelComponent } from './step-panel.component';

const DOCUMENT_LANGUAGES: DocumentLanguage[] = ['vi', 'en'];

interface TreeNode {
  path: string;
  icon: string;
  desc: TranslationKey;
}

const PROJECT_TREE: TreeNode[] = [
  { path: 'procheck.json', icon: 'file-json', desc: 'np.t.manifest' },
  { path: 'sources\\', icon: 'folder', desc: 'np.t.sources' },
  { path: 'artifacts\\', icon: 'folder', desc: 'np.t.artifacts' },
  { path: 'board\\', icon: 'folder', desc: 'np.t.board' },
  { path: '.procheck\\chats\\', icon: 'folder', desc: 'np.t.chats' },
  { path: '.procheck\\runs\\', icon: 'folder', desc: 'np.t.runs' },
  { path: '.procheck\\cli\\<cli>\\', icon: 'folder', desc: 'np.t.cli' },
  { path: '.procheck\\worktrees\\', icon: 'folder', desc: 'np.t.worktrees' },
  { path: '.procheck\\settings.json', icon: 'file-json', desc: 'np.t.settings' },
];

@Component({
  selector: 'pc-np-basics-step',
  imports: [ButtonComponent, FieldComponent, InputDirective, IconComponent, SegmentedComponent, StepPanelComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-np-step-panel [title]="'np.s1.t' | t" [description]="'np.s1.d' | t">
      <div class="sec">
        <div class="fgrid">
          <pc-field class="s4" [label]="('np.name' | t) + ' *'" for="np-name" [error]="error(form.nameError())">
            <input
              pcInput
              id="np-name"
              autocomplete="off"
              data-testid="np-name"
              [invalid]="!!error(form.nameError())"
              [placeholder]="'np.name.ph' | t"
              [value]="form.name()"
              (input)="form.setName(value($event))"
            />
          </pc-field>
          <pc-field class="s2" [label]="'np.code' | t" for="np-code" [hint]="'np.code.h' | t">
            <input pcInput id="np-code" class="mono" autocomplete="off" placeholder="LP" [value]="form.code()" (input)="form.setCode(value($event))" />
          </pc-field>
          <pc-field class="s3" [label]="'np.client' | t" for="np-client">
            <input pcInput id="np-client" autocomplete="off" [placeholder]="'np.client.ph' | t" [value]="form.client()" (input)="form.client.set(value($event))" />
          </pc-field>
          <pc-field class="s3" [label]="'np.industry' | t" for="np-industry">
            <select pcInput id="np-industry" [value]="form.industry()" (change)="form.industry.set(value($event))">
              <option value="">{{ 'np.ind.none' | t }}</option>
              @for (industry of industries; track industry) {
                <option [value]="industry" [selected]="industry === form.industry()">{{ 'np.ind.' + industry | t }}</option>
              }
            </select>
          </pc-field>
          <pc-field class="s6" [label]="'np.doclang' | t" [hint]="'np.doclang.h' | t">
            <pc-segmented data-testid="np-doclang" [options]="languageOptions()" [value]="form.documentLanguage()" (valueChange)="setLanguage($event)" />
          </pc-field>
          <pc-field class="s6" [label]="'np.desc' | t" for="np-desc" [hint]="'np.desc.h' | t">
            <textarea pcInput id="np-desc" [placeholder]="'np.desc.ph' | t" [value]="form.description()" (input)="form.description.set(value($event))"></textarea>
          </pc-field>
        </div>

        <pc-field [label]="('np.dir' | t) + ' *'" for="np-dir" [error]="dirError()" [hint]="'np.dir.h' | t">
          <div class="dir-row">
            <div class="input-group grow">
              <pc-icon name="folder" />
              <input
                pcInput
                id="np-dir"
                class="mono"
                autocomplete="off"
                spellcheck="false"
                data-testid="np-dir"
                [invalid]="!!dirError()"
                [placeholder]="'np.dir.ph' | t"
                [value]="form.dir()"
                (input)="form.setDir(value($event))"
              />
            </div>
            <button pcButton type="button" (click)="form.browseDir()"><pc-icon name="folder-open" /> {{ 'np.browse' | t }}</button>
          </div>
        </pc-field>
      </div>

      <div class="sec">
        <div>
          <div class="sub-title">
            <h5>{{ 'np.tree.title' | t }}</h5>
            <span class="text-xs text-subtle">{{ 'np.tree.sub' | t }}</span>
          </div>
          <div class="ptree">
            <div class="ptree-head"><pc-icon name="folder-open" [size]="14" /><span class="truncate">{{ rootLabel() }}</span></div>
            <div class="tbody">
              @for (node of tree; track node.path) {
                <div class="tnode" [class.is-hidden]="node.path.startsWith('.procheck')">
                  <pc-icon [name]="node.icon" [size]="14" />
                  <span class="tp">{{ node.path }}</span>
                  <span class="td">{{ node.desc | t }}</span>
                </div>
              }
            </div>
          </div>
        </div>
        <div class="note-line"><pc-icon name="hard-drive" [size]="14" /><span class="grow">{{ 'np.tree.note' | t }}</span></div>
      </div>
    </pc-np-step-panel>
  `,
})
export class BasicsStepComponent {
  protected readonly form = inject(NewProjectForm);
  private readonly i18n = inject(I18nService);

  protected readonly industries = INDUSTRIES;
  protected readonly languageOptions = computed<SegmentedOption[]>(() =>
    DOCUMENT_LANGUAGES.map((lang) => ({ value: lang, label: this.i18n.t(`lang.${lang}`) })),
  );
  protected readonly tree = PROJECT_TREE;
  protected readonly rootLabel = computed(() => this.form.dir().trim() || this.i18n.t('np.dir.ph'));

  protected readonly dirError = computed(() => {
    const key = this.form.dirError();
    const show = this.form.attempted() || this.form.dirCheck() !== null;
    return key && show ? this.i18n.t(key) : '';
  });

  protected setLanguage(value: string): void {
    this.form.documentLanguage.set(value as DocumentLanguage);
  }

  protected error(key: TranslationKey | null): string {
    return key && this.form.attempted() ? this.i18n.t(key) : '';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
