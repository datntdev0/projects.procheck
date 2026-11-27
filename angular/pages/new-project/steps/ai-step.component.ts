import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AlertComponent } from '@components/alert/alert.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_NAMES, AgentModel, ConnectionState } from '@features/agents/agents.service';
import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { NewProjectForm } from '../new-project-form';
import { StepPanelComponent } from './step-panel.component';

const CONNECTION_LABELS: Record<ConnectionState, TranslationKey> = {
  checking: 'np.ai.checking',
  connected: 'np.ai.connected',
  missing: 'np.ai.notConnected',
  signedOut: 'np.ai.notConnected',
};

@Component({
  selector: 'pc-np-ai-step',
  imports: [AlertComponent, IconComponent, InputDirective, RouterLink, StepPanelComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-np-step-panel [title]="'np.s4.t' | t" [description]="'np.s4.d' | t">
      <div class="sec">
        <div>
          <div class="sub-title"><h5>{{ 'np.ai.cli' | t }}</h5></div>
          <div class="opts two" role="radiogroup">
            @for (agent of agents; track agent) {
              <div
                class="opt cli-card"
                role="radio"
                tabindex="0"
                [class.is-selected]="agent === form.cli()"
                [attr.aria-checked]="agent === form.cli()"
                [attr.data-testid]="'np-cli-' + agent"
                (click)="form.setCli(agent)"
                (keydown.enter)="form.setCli(agent)"
                (keydown.space)="form.setCli(agent)"
              >
                <span class="tick"><pc-icon name="check" [size]="10" [strokeWidth]="3.5" /></span>
                <div class="cli-top">
                  <span class="cli-logo"><pc-icon [name]="agent === 'claude' ? 'sparkles' : 'terminal'" [size]="20" /></span>
                  <div>
                    <h4>{{ names[agent] }}</h4>
                    <div class="cli-meta">
                      <span [class.text-success]="connections.connected(agent)">{{ connectionLabel(agent) | t }}</span>
                      @if (version(agent); as v) {
                        <code>v{{ v }}</code>
                      }
                    </div>
                  </div>
                </div>
                @if (agent === form.cli()) {
                  <label class="cli-model" (click)="$event.stopPropagation()">
                    {{ 'np.ai.model' | t }}
                    <select pcInput (change)="setModel($event)">
                      <option value="" [selected]="!form.model()">{{ 'np.ai.default' | t }}</option>
                      @for (model of models(); track model.id) {
                        <option [value]="model.id" [selected]="model.id === form.model()">{{ model.label }}</option>
                      }
                    </select>
                  </label>
                }
              </div>
            }
          </div>
        </div>

        @if (!form.connectedClis().length) {
          <pc-alert tone="warning">
            {{ 'np.ai.none' | t }}
            <a pcAlertActions routerLink="/settings" class="text-sm">{{ 'nav.settings' | t }}</a>
          </pc-alert>
        }
      </div>

      <div class="sec">
        <div class="note-line home">
          <pc-icon name="shield-check" [size]="14" />
          <div class="grow" style="min-width: 0">
            <div class="home-t">{{ 'np.ai.home.t' | t }}</div>
            <div class="text-muted" style="margin-top: 2px">{{ 'np.ai.home.d' | t }}</div>
            <div class="code home-code">{{ profilePath() }}</div>
          </div>
        </div>
      </div>

      <div class="sec">
        <div>
          <div class="sub-title"><h5>{{ 'np.rev.title' | t }}</h5></div>
          <div class="rev">
            @for (row of review(); track row.label) {
              <div class="rev-item">
                <pc-icon name="circle-check" [size]="14" />
                <span class="k">{{ row.label | t }}</span>
                <span class="v" [class.mono]="row.mono">{{ row.value }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </pc-np-step-panel>
  `,
})
export class AiStepComponent {
  protected readonly form = inject(NewProjectForm);
  protected readonly connections = inject(AgentConnectionsService);
  private readonly i18n = inject(I18nService);

  protected readonly agents = AGENT_IDS;
  protected readonly names = AGENT_NAMES;

  protected readonly models = computed<AgentModel[]>(() => this.connections.status(this.form.cli())?.models ?? []);

  protected readonly profilePath = computed(() => `${this.form.dir().trim() || '<project dir>'}\\.procheck\\cli\\${this.form.cli()}`);

  protected readonly modelLabel = computed(() => {
    const id = this.form.model();
    return this.models().find((m) => m.id === id)?.label ?? id ?? this.i18n.t('np.ai.default');
  });

  protected readonly review = computed(() => {
    const repository = this.form.repoInfo()?.root ?? this.form.repository().trim();
    return [
      { label: 'np.rev.folder', value: this.form.dir().trim(), mono: true },
      { label: 'np.rev.home', value: this.profilePath(), mono: true },
      { label: 'np.rev.docs', value: this.i18n.t('np.rev.docs.v', { n: this.form.sources().length }), mono: false },
      { label: 'np.rev.repo', value: repository || this.i18n.t('np.sum.none'), mono: !!repository },
      {
        label: 'np.rev.assistant',
        value: this.i18n.t('np.rev.assistant.v', { cli: AGENT_NAMES[this.form.cli()], model: this.modelLabel() }),
        mono: false,
      },
    ] satisfies { label: TranslationKey; value: string; mono: boolean }[];
  });

  protected connectionLabel(agent: AgentId): TranslationKey {
    return CONNECTION_LABELS[this.connections.state(agent)];
  }

  protected version(agent: AgentId): string | null {
    return this.connections.status(agent)?.version ?? null;
  }

  protected setModel(event: Event): void {
    this.form.model.set((event.target as HTMLSelectElement).value || null);
  }
}
