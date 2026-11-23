import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StatusDotComponent } from '@components/badge/status-dot.component';
import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { IconComponent } from '@components/icon/icon.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_NAMES, AgentModel, ConnectionState } from '@features/agents/agents.service';
import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

const MAX_HEIGHT = 200;

const STATE_TONES: Record<ConnectionState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  connected: 'success',
  signedOut: 'warning',
  missing: 'danger',
  checking: 'neutral',
};

interface CliOption {
  id: AgentId;
  name: string;
  state: ConnectionState;
  stateLabel: TranslationKey;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  version: string | null;
  disabled: boolean;
}

@Component({
  selector: 'pc-chat-composer',
  imports: [RouterLink, StatusDotComponent, DropdownComponent, IconComponent, TooltipDirective, TranslatePipe, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cmp-block' },
  template: `
    @if (offline(); as state) {
      <div class="cmp-warn" role="status" data-testid="chat-cli-offline">
        <pc-icon name="triangle-alert" [size]="14" />
        <span class="grow">{{ (state === 'missing' ? 'ch.cli.missing' : 'ch.cli.signedout') | t: { cli: agentName() } }}</span>
        <a routerLink="/settings">{{ 'ch.open.settings' | t }}</a>
      </div>
    }
    <div class="cmp">
      <textarea
        #input
        rows="1"
        data-testid="chat-input"
        [placeholder]="'ch.ph' | t"
        [attr.aria-label]="'ch.message' | t"
        [value]="draft()"
        (input)="onInput()"
        (keydown)="onKeydown($event)"
      ></textarea>
      <div class="cmp-bar">
        <span class="grow"></span>
        <pc-dropdown placement="top-end">
          <button type="button" class="pill" pcDropdownTrigger data-testid="chat-cli">
            @if (currentState() === 'checking') {
              <span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px" aria-hidden="true"></span>
            } @else {
              <pc-status-dot [tone]="currentTone()" style="width: 6px; height: 6px" />
            }
            {{ agentName() }}
            <pc-icon name="chevron-down" [size]="14" />
          </button>
          <pc-menu class="cli-menu">
            <pc-menu-label>{{ 'ch.cli.pick' | t }}</pc-menu-label>
            @for (cli of clis(); track cli.id) {
              <button
                type="button"
                pcMenuItem
                [active]="cli.id === agent()"
                [disabled]="cli.disabled"
                [attr.data-testid]="'chat-cli-' + cli.id"
                (click)="agentChange.emit(cli.id)"
              >
                @if (cli.state === 'checking') {
                  <span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px" aria-hidden="true"></span>
                } @else {
                  <pc-status-dot [tone]="cli.tone" />
                }
                <span class="grow">
                  <span class="mi-t">{{ cli.name }}</span>
                  <span class="mi-d">{{ cli.stateLabel | t }}{{ cli.version ? ' · v' + cli.version : '' }}</span>
                </span>
                @if (cli.id === agent()) {
                  <pc-icon name="check" />
                }
              </button>
            }
            @if (locked()) {
              <div class="mi-note">{{ 'ch.cli.locked' | t }}</div>
            }
          </pc-menu>
        </pc-dropdown>
        <pc-dropdown placement="top-end">
          <button type="button" class="pill" pcDropdownTrigger data-testid="chat-model">
            <span class="mono" style="font-size: 11px">{{ modelLabel() }}</span>
            <pc-icon name="chevron-down" [size]="14" />
          </button>
          <pc-menu class="cli-menu">
            <pc-menu-label>{{ 'ch.model' | t }} · {{ agentName() }}</pc-menu-label>
            <button type="button" pcMenuItem [active]="!selectedModel()" data-testid="chat-model-default" (click)="modelChange.emit(null)">
              <span class="grow">{{ defaultModelLabel() }}</span>
              @if (!selectedModel()) {
                <pc-icon name="check" />
              }
            </button>
            @for (model of models(); track model.id) {
              <button type="button" pcMenuItem [active]="model.id === selectedModel()" [attr.data-testid]="'chat-model-' + model.id" (click)="modelChange.emit(model.id)">
                <span class="grow">{{ model.label }}</span>
                @if (model.id === selectedModel()) {
                  <pc-icon name="check" />
                }
              </button>
            }
          </pc-menu>
        </pc-dropdown>
        @if (busy()) {
          <button type="button" class="sendb stop" data-testid="chat-stop" [pcTooltip]="'ch.stop' | t" (click)="stop.emit()">
            <pc-icon name="square" />
          </button>
        } @else {
          <button type="button" class="sendb" data-testid="chat-send" [attr.aria-label]="'ch.send' | t" [disabled]="!canSend()" (click)="submit()">
            <pc-icon name="arrow-up" />
          </button>
        }
      </div>
    </div>
  `,
})
export class ChatComposerComponent {
  protected readonly i18n = inject(I18nService);
  private readonly connections = inject(AgentConnectionsService);
  private readonly settings = inject(AppSettingsService);
  private readonly input = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');

  readonly agent = input.required<AgentId>();
  readonly selectedModel = input<string | null>(null);
  readonly locked = input(false);
  readonly busy = input(false);
  readonly send = output<string>();
  readonly stop = output<void>();
  readonly agentChange = output<AgentId>();
  readonly modelChange = output<string | null>();

  protected readonly draft = signal('');
  protected readonly agentName = computed(() => AGENT_NAMES[this.agent()]);
  protected readonly currentState = computed(() => this.connections.state(this.agent()));
  protected readonly currentTone = computed(() => STATE_TONES[this.currentState()]);
  protected readonly offline = computed(() => {
    const state = this.currentState();
    return state === 'missing' || state === 'signedOut' ? state : null;
  });
  protected readonly canSend = computed(() => this.draft().trim().length > 0 && !this.offline());

  protected readonly clis = computed<CliOption[]>(() =>
    AGENT_IDS.map((id) => {
      const state = this.connections.state(id);
      return {
        id,
        name: AGENT_NAMES[id],
        state,
        stateLabel: `ch.cli.state.${state}` as TranslationKey,
        tone: STATE_TONES[state],
        version: this.connections.status(id)?.version ?? null,
        disabled: id !== this.agent() && (this.locked() || state !== 'connected'),
      };
    }),
  );

  private readonly settingsModel = computed(() => this.settings.settings().agents[this.agent()].model);

  protected readonly models = computed<AgentModel[]>(() => {
    const list = this.connections.status(this.agent())?.models ?? [];
    const selected = this.selectedModel();
    return selected && !list.some((m) => m.id === selected) ? [...list, { id: selected, label: selected }] : list;
  });

  protected readonly defaultModelLabel = computed(() => {
    const model = this.settingsModel();
    return model ? this.i18n.t('ch.model.default.named', { model }) : this.i18n.t('ch.model.cli');
  });

  protected readonly modelLabel = computed(() => this.selectedModel() ?? this.settingsModel() ?? this.i18n.t('ch.model.default'));

  fill(text: string): void {
    this.draft.set(text);
    this.input().nativeElement.value = text;
    this.focus();
    this.resize();
  }

  focus(): void {
    this.input().nativeElement.focus();
  }

  protected onInput(): void {
    this.draft.set(this.input().nativeElement.value);
    this.resize();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!this.busy()) this.submit();
  }

  protected submit(): void {
    const text = this.draft().trim();
    if (!text || this.offline()) return;
    this.send.emit(text);
    this.fill('');
  }

  private resize(): void {
    const el = this.input().nativeElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`;
  }
}
