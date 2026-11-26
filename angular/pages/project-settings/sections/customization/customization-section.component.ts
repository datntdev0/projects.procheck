import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { TabItem, TabsComponent } from '@components/tabs/tabs.component';
import type { Phase } from '@components/badge/phase-chip.component';
import { ToastService } from '@components/toast/toast.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SETTINGS_SECTION } from '../../../settings/settings-section.component';
import { PHASES, PhaseConfig, PhaseDefinition, StepArtifactConfig, StepConfig, fileSizeLabel } from './customization.model';
import { StepConfigCardComponent } from './step-config-card.component';

let keySeq = 0;
const nextKey = (): string => `a${++keySeq}`;

/**
 * Customization: how the Assistant works in each phase of the project, one tab per phase (Initial phase,
 * Scaffolding, SDLC). Each phase has a prompt, then steps with free-text instructions and the artifacts
 * they produce (name + optional template file of any type). Scaffolding and SDLC steps can be turned off.
 *
 * UI only for now: the configuration lives in this component and is neither loaded from nor saved to
 * `.procheck\settings.json` → `customization` (templates in `.procheck\templates\`).
 */
@Component({
  selector: 'pc-customization-section',
  imports: [
    ButtonComponent,
    DialogComponent,
    DialogFooterDirective,
    IconComponent,
    InputDirective,
    RouterLink,
    StepConfigCardComponent,
    TabsComponent,
    TranslatePipe,
    ...SETTINGS_SECTION,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="customize" [title]="'ps.n.cz' | t" [description]="'ps.cz.d' | t">
      <div class="card cz-card">
        <pc-tabs class="cz-tabs" [items]="tabs()" [(active)]="activeTab" data-testid="ps-cz-tabs" />

        @let def = phase();
        @let config = current();
        <div class="cz-body" [attr.data-testid]="'ps-cz-panel-' + def.id">
          <div class="fl-bar">
            <span class="text-xs text-subtle" data-testid="ps-fl-summary">{{ 'ps.fl.sum' | t: { a: artifactCount(), t: templateCount() } }}</span>
            <span class="grow"></span>
            <button pcButton variant="ghost" size="sm" type="button" data-testid="ps-fl-reset" (click)="resetOpen.set(true)">
              <pc-icon name="rotate-ccw" />{{ 'ps.fl.reset' | t }}
            </button>
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
              @if (config.prompt !== null) {
                <button pcButton variant="ghost" size="sm" type="button" data-testid="ps-cz-prompt-reset" (click)="setPrompt(null)">
                  <pc-icon name="rotate-ccw" />{{ 'ps.fl.instr.reset' | t }}
                </button>
              }
            </div>
            <textarea
              pcInput
              class="prompt"
              spellcheck="false"
              data-testid="ps-cz-prompt"
              [value]="config.prompt ?? (def.prompt | t)"
              (input)="setPrompt(text($event))"
            ></textarea>
          </div>

          <div class="cz-steps-h">
            <span class="slabel">{{ 'ps.cz.steps.' + def.id | t }}</span>
            <span class="sdesc">{{ 'ps.cz.steps.' + def.id + '.d' | t }}</span>
          </div>

          @for (step of config.steps; track step.id; let i = $index) {
            <pc-step-config-card
              [definition]="def.steps[i]"
              [step]="step"
              [index]="i"
              [optional]="def.optional"
              [artifactsHint]="'ps.cz.arts.d.' + def.id"
              [instructionText]="step.instructions ?? (def.steps[i].instructions | t)"
              [open]="openStep()[def.id] === step.id"
              (openChange)="setOpen(step.id, $event)"
              (instructionsChange)="patchStep(step.id, { instructions: $event })"
              (resetInstructions)="patchStep(step.id, { instructions: null })"
              (offChange)="patchStep(step.id, { off: $event })"
              (addArtifact)="addArtifact(step.id)"
              (renameArtifact)="patchArtifact(step.id, $event.index, { name: $event.name })"
              (attachTemplate)="attach(step.id, $event.index, $event.file)"
              (removeTemplate)="patchArtifact(step.id, $event, { template: null })"
              (removeArtifact)="removeArtifact(step.id, $event)"
            />
          }
        </div>
        <div class="note-row">
          <pc-icon name="info" [size]="14" />
          <span>{{ 'ps.fl.note' | t }}</span>
        </div>
      </div>
    </pc-settings-section>

    <pc-dialog [(open)]="resetOpen" [title]="'ps.fl.reset.t' | t: { ph: (phase().label | t) }" width="min(480px, 100%)">
      <p class="text-sm text-muted" style="margin: 0">{{ 'ps.fl.reset.d' | t }}</p>
      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" type="button" (click)="resetOpen.set(false)">{{ 'common.cancel' | t }}</button>
        <button pcButton variant="primary" type="button" data-testid="ps-fl-reset-confirm" (click)="reset()">
          <pc-icon name="rotate-ccw" />{{ 'ps.fl.reset' | t }}
        </button>
      </div>
    </pc-dialog>
  `,
})
export class CustomizationSectionComponent {
  /** Project id, for the links to the phase pages. */
  readonly projectId = input.required<string>();

  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  protected readonly activeTab = signal<string>('initial');
  protected readonly configs = signal<Record<Phase, PhaseConfig>>({
    initial: this.defaults(PHASES[0]),
    release: this.defaults(PHASES[1]),
    sdlc: this.defaults(PHASES[2]),
  });
  protected readonly openStep = signal<Record<Phase, string | null>>({ initial: 'discovery', release: 'structure', sdlc: 'plan' });
  protected readonly resetOpen = signal(false);

  protected readonly phase = computed(() => PHASES.find((p) => p.id === this.activeTab()) ?? PHASES[0]);
  protected readonly current = computed(() => this.configs()[this.phase().id]);

  /** One tab per phase; the count is the number of steps that are on. */
  protected readonly tabs = computed<TabItem[]>(() =>
    PHASES.map((p) => ({
      id: p.id,
      label: this.i18n.t(p.label),
      icon: p.icon,
      count: this.configs()[p.id].steps.filter((s) => !s.off).length,
    })),
  );

  protected readonly artifactCount = computed(() => this.current().steps.reduce((n, s) => n + s.artifacts.length, 0));
  protected readonly templateCount = computed(() => this.current().steps.reduce((n, s) => n + s.artifacts.filter((a) => a.template).length, 0));

  protected text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected setOpen(stepId: string, open: boolean): void {
    const phase = this.phase().id;
    this.openStep.update((o) => ({ ...o, [phase]: open ? stepId : null }));
  }

  protected setPrompt(prompt: string | null): void {
    this.updatePhase((c) => ({ ...c, prompt }));
  }

  protected patchStep(stepId: string, changes: Partial<StepConfig>): void {
    this.updateStep(stepId, (s) => ({ ...s, ...changes }));
  }

  protected addArtifact(stepId: string): void {
    this.updateStep(stepId, (s) => ({ ...s, artifacts: [...s.artifacts, { key: nextKey(), name: '', template: null }] }));
  }

  protected removeArtifact(stepId: string, index: number): void {
    this.updateStep(stepId, (s) => ({ ...s, artifacts: s.artifacts.filter((_, n) => n !== index) }));
  }

  protected patchArtifact(stepId: string, index: number, changes: Partial<StepArtifactConfig>): void {
    this.updateStep(stepId, (s) => ({ ...s, artifacts: s.artifacts.map((a, n) => (n === index ? { ...a, ...changes } : a)) }));
  }

  protected attach(stepId: string, index: number, file: File): void {
    this.patchArtifact(stepId, index, { template: { name: file.name, size: fileSizeLabel(file.size) } });
    this.toast.show(this.i18n.t('ps.fl.attached', { f: file.name }), { icon: 'paperclip' });
  }

  /** Resets the phase on the active tab only. */
  protected reset(): void {
    const def = this.phase();
    this.updatePhase(() => this.defaults(def));
    this.resetOpen.set(false);
    this.toast.show(this.i18n.t('ps.fl.reset.done', { ph: this.i18n.t(def.label) }), { icon: 'rotate-ccw' });
  }

  private updatePhase(change: (config: PhaseConfig) => PhaseConfig): void {
    const phase = this.phase().id;
    this.configs.update((c) => ({ ...c, [phase]: change(c[phase]) }));
  }

  private updateStep(stepId: string, change: (step: StepConfig) => StepConfig): void {
    this.updatePhase((c) => ({ ...c, steps: c.steps.map((s) => (s.id === stepId ? change(s) : s)) }));
  }

  private defaults(def: PhaseDefinition): PhaseConfig {
    return {
      prompt: null,
      steps: def.steps.map((s) => ({
        id: s.id,
        instructions: null,
        off: false,
        artifacts: s.artifacts.map((name): StepArtifactConfig => ({ key: nextKey(), name: this.i18n.t(name as TranslationKey), template: null })),
      })),
    };
  }
}
