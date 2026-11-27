import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { InputDirective } from '@components/form/input.directive';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { MarkdownComponent } from '@pages/chats/markdown.component';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SETTINGS_SECTION } from '../../../settings/settings-section.component';
import { ProjectCustomizationForm, TemplateUploadResult } from '../../project-customization-form';
import { INITIAL_PHASE, StepView } from './customization.model';
import { StepConfigCardComponent } from './step-config-card.component';

/** Why a picked file was not attached as a template. */
const UPLOAD_ERRORS: Record<Exclude<TemplateUploadResult, 'ok'>, TranslationKey> = {
  templateType: 'ps.fl.err.type',
  templateTooLarge: 'ps.fl.err.size',
  unreadable: 'ps.fl.err.read',
};

/**
 * Customization: how the Assistant works in the Initial phase of the project. A phase prompt, then steps with
 * free-text instructions and the artifacts they produce (name + optional Markdown template). Everything is
 * edited in {@link ProjectCustomizationForm} and saved through the save bar to `.procheck\settings.json` →
 * `customization` (templates in `.procheck\templates\`). Scaffolding and SDLC are not customizable yet.
 */
@Component({
  selector: 'pc-customization-section',
  imports: [
    ButtonComponent,
    DialogComponent,
    DialogFooterDirective,
    EmptyStateComponent,
    IconComponent,
    InputDirective,
    MarkdownComponent,
    RouterLink,
    StepConfigCardComponent,
    TranslatePipe,
    ...SETTINGS_SECTION,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section class="cz-sec" sectionId="customize" [title]="'ps.n.cz' | t" [description]="'ps.cz.d' | t">
      @if (form.status() === 'loading') {
        <div class="cz-state text-sm text-subtle" data-testid="ps-cz-loading">{{ 'ps.cz.loading' | t }}</div>
      } @else if (form.status() === 'error') {
        <pc-empty-state icon="circle-alert" [title]="'ps.cz.err.t' | t" [description]="'ps.cz.err.d' | t" data-testid="ps-cz-error">
          <button pcButton type="button" data-testid="ps-cz-retry" (click)="form.load()"><pc-icon name="refresh-cw" />{{ 'ps.cz.retry' | t }}</button>
        </pc-empty-state>
      } @else if (!form.phase()) {
        <pc-empty-state icon="history" [title]="'ps.cz.none.t' | t" [description]="'ps.cz.none.d' | t" data-testid="ps-cz-empty" />
      } @else {
        <div class="cz-body" [attr.data-testid]="'ps-cz-panel-' + def.id">
          <div class="fl-bar">
            <span class="text-xs text-subtle" data-testid="ps-fl-summary">{{ 'ps.fl.sum' | t: { a: artifactCount(), t: templateCount() } }}</span>
            <span class="grow"></span>
            @if (form.defaults()) {
              <button pcButton variant="ghost" size="sm" type="button" data-testid="ps-fl-reset" (click)="resetOpen.set(true)">
                <pc-icon name="rotate-ccw" />{{ 'ps.fl.reset' | t }}
              </button>
            }
            <a pcButton size="sm" [routerLink]="['/projects', projectId(), def.segment]">
              <pc-icon name="external-link" />{{ 'ps.cz.open.' + def.id | t }}
            </a>
          </div>

          <div class="cz-prompt">
            <div class="fs-block-head">
              <div class="sinfo">
                <div class="slabel">{{ 'ps.cz.prompt' | t }}</div>
                <div class="sdesc">{{ 'ps.cz.prompt.d' | t }}</div>
              </div>
              @if (promptCustom()) {
                <button pcButton variant="ghost" size="sm" type="button" data-testid="ps-cz-prompt-reset" (click)="resetPrompt()">
                  <pc-icon name="rotate-ccw" />{{ 'ps.fl.instr.reset' | t }}
                </button>
              }
            </div>
            <textarea
              pcInput
              class="prompt"
              spellcheck="false"
              data-testid="ps-cz-prompt"
              [value]="form.phase()?.prompt ?? ''"
              (input)="form.setPrompt(text($event))"
            ></textarea>
          </div>

          <div class="cz-steps-h">
            <span class="slabel">{{ 'ps.cz.steps.' + def.id | t }}</span>
            <span class="sdesc">{{ 'ps.cz.steps.' + def.id + '.d' | t }}</span>
          </div>

          @for (step of steps(); track step.id; let i = $index) {
            <pc-step-config-card
              [definition]="definition(step.id)"
              [step]="step"
              [index]="i"
              [artifactsHint]="'ps.cz.arts.d.' + def.id"
              [open]="openStep() === step.id"
              (openChange)="openStep.set($event ? step.id : null)"
              (instructionsChange)="form.setInstructions(step.id, $event)"
              (resetInstructions)="resetInstructions(step.id)"
              (addArtifact)="form.addArtifact(step.id)"
              (renameArtifact)="form.renameArtifact($event.id, $event.name)"
              (attachTemplate)="attach($event.id, $event.file)"
              (previewTemplate)="showPreview($event)"
              (restoreTemplate)="form.restoreTemplate($event)"
              (removeTemplate)="form.removeTemplate($event)"
              (removeArtifact)="form.removeArtifact($event)"
            />
          }
        </div>
      }
      <div class="note-row">
        <pc-icon name="info" [size]="14" />
        <span>{{ 'ps.fl.note' | t }}</span>
      </div>
    </pc-settings-section>

    <pc-dialog [(open)]="resetOpen" [title]="'ps.fl.reset.t' | t: { ph: (def.label | t) }" width="min(480px, 100%)">
      <p class="text-sm text-muted" style="margin: 0">{{ 'ps.fl.reset.d' | t }}</p>
      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" type="button" (click)="resetOpen.set(false)">{{ 'common.cancel' | t }}</button>
        <button pcButton variant="primary" type="button" data-testid="ps-fl-reset-confirm" (click)="reset()">
          <pc-icon name="rotate-ccw" />{{ 'ps.fl.reset' | t }}
        </button>
      </div>
    </pc-dialog>

    <pc-dialog [(open)]="previewOpen" [title]="preview()?.name ?? ''" width="min(760px, 100%)">
      <div class="tpl-preview" data-testid="ps-fl-preview">
        @if (preview(); as file) {
          <pc-markdown [source]="file.content" />
        }
      </div>
      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" type="button" (click)="previewOpen.set(false)">{{ 'common.close' | t }}</button>
      </div>
    </pc-dialog>
  `,
})
export class CustomizationSectionComponent {
  /** Project id, for the links to the phase pages. */
  readonly projectId = input.required<string>();

  protected readonly form = inject(ProjectCustomizationForm);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  protected readonly def = INITIAL_PHASE;
  protected readonly openStep = signal<string | null>('discovery');
  protected readonly resetOpen = signal(false);
  protected readonly previewOpen = signal(false);
  protected readonly preview = signal<{ name: string; content: string } | null>(null);

  /** The steps with their artifacts as the user currently sees them (staged template changes applied). */
  protected readonly steps = computed<StepView[]>(() => {
    const defaults = this.form.defaults();
    return (this.form.phase()?.steps ?? []).map((step) => ({
      id: step.id,
      instructions: step.instructions,
      custom: !!defaults && step.instructions !== defaults.steps.find((s) => s.id === step.id)?.instructions,
      artifacts: step.artifacts.map((artifact) => ({
        id: artifact.id,
        name: artifact.name,
        template: this.form.template(artifact.id),
        canRestore: this.form.canRestore(artifact.id),
      })),
    }));
  });

  protected readonly promptCustom = computed(() => {
    const defaults = this.form.defaults();
    return !!defaults && this.form.phase()?.prompt !== defaults.prompt;
  });
  protected readonly artifactCount = computed(() => this.steps().reduce((n, s) => n + s.artifacts.length, 0));
  protected readonly templateCount = computed(() => this.steps().reduce((n, s) => n + s.artifacts.filter((a) => a.template).length, 0));

  protected definition(stepId: string) {
    return this.def.steps.find((s) => s.id === stepId) ?? this.def.steps[0];
  }

  protected text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected resetPrompt(): void {
    const prompt = this.form.defaults()?.prompt;
    if (prompt !== undefined) this.form.setPrompt(prompt);
  }

  protected resetInstructions(stepId: string): void {
    const instructions = this.form.defaults()?.steps.find((s) => s.id === stepId)?.instructions;
    if (instructions !== undefined) this.form.setInstructions(stepId, instructions);
  }

  protected async attach(artifactId: string, file: File): Promise<void> {
    const result = await this.form.stageUpload(artifactId, file);
    if (result === 'ok') {
      this.toast.show(this.i18n.t('ps.fl.attached', { f: file.name }), { icon: 'paperclip' });
    } else {
      this.toast.show(this.i18n.t(UPLOAD_ERRORS[result], { f: file.name }), { icon: 'circle-alert', tone: 'danger', duration: 6000 });
    }
  }

  protected async showPreview(artifactId: string): Promise<void> {
    try {
      this.preview.set(await this.form.readTemplate(artifactId));
      this.previewOpen.set(true);
    } catch (error) {
      console.error('Could not read the template', error);
      this.toast.show(this.i18n.t('ps.fl.err.preview'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  /** Puts the phase back to the bundled defaults; it is saved with the save bar. */
  protected reset(): void {
    this.form.resetPhase();
    this.resetOpen.set(false);
    this.toast.show(this.i18n.t('ps.fl.reset.done', { ph: this.i18n.t(this.def.label) }), { icon: 'rotate-ccw' });
  }
}
