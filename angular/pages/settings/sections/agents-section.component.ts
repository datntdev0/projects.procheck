import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { BadgeComponent } from '@components/badge/badge.component';
import { StatusDotComponent } from '@components/badge/status-dot.component';
import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_DOCS, AGENT_INSTALL, AGENT_NAMES, AgentModel, AgentStatus, AgentsService, ConnectionState, connectionState } from '@features/agents/agents.service';
import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SettingsFormService } from '../settings-form.service';
import { SETTINGS_SECTION } from '../settings-section.component';

/** Wait after the last keystroke in the binary path before checking it again. */
const RECHECK_DELAY_MS = 500;

const AGENT_ICONS: Record<AgentId, string> = { claude: 'bot-message-square', codex: 'square-terminal' };

/** One CLI: status, default flag, sign-in, connection test, executable and default model. */
@Component({
  selector: 'pc-agent-card',
  imports: [
    BadgeComponent,
    StatusDotComponent,
    ButtonComponent,
    DialogComponent,
    DialogFooterDirective,
    InputDirective,
    IconComponent,
    TooltipDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cli-card', '[attr.data-testid]': "'agent-' + agent()", '[attr.data-state]': 'state()' },
  template: `
    <div class="cli-head">
      <span class="cli-logo"><pc-icon [name]="icon()" [size]="20" /></span>
      <div class="cli-title">
        <div class="cname">
          {{ name() }}
          @if (isDefault()) {
            <pc-badge tone="brand" data-testid="agent-default-badge"><pc-icon name="star" [size]="12" />{{ 'set.ag.default' | t }}</pc-badge>
          }
        </div>
        <div class="cli-stat" data-testid="agent-status">
          @switch (state()) {
            @case ('checking') {
              <span class="spinner" aria-hidden="true"></span><span>{{ 'set.ag.checking' | t }}</span>
            }
            @case ('missing') {
              <pc-status-dot tone="danger" /><span>{{ 'set.ag.missing' | t }}</span>
            }
            @case ('signedOut') {
              <pc-status-dot tone="warning" /><span>{{ 'set.ag.signedout' | t }}</span>
            }
            @case ('connected') {
              <pc-status-dot tone="success" /><span>{{ 'set.ag.connected' | t }}</span>
            }
          }
          @if (status()?.version; as version) {
            <span>·</span><span data-testid="agent-version">v{{ version }}</span>
          }
          <span>·</span>
          <a class="cli-doc" data-testid="agent-docs" [href]="docs()" [title]="docs()" (click)="openGuide($event)">
            {{ 'set.ag.docs' | t }}<pc-icon name="arrow-up-right" [size]="12" />
          </a>
        </div>
      </div>
      <div class="cli-acts">
        @if (!isDefault()) {
          <button pcButton variant="ghost" size="sm" type="button" data-testid="agent-set-default" (click)="form.setDefaultAgent(agent())">
            <pc-icon name="star" />{{ 'set.ag.setdefault' | t }}
          </button>
        }
        @if (state() === 'connected') {
          <button pcButton variant="ghost" size="sm" type="button" data-testid="agent-sign-out" [disabled]="busy()" (click)="confirmSignOut.set(true)">
            <pc-icon name="log-out" />{{ 'set.ag.signout' | t }}
          </button>
        } @else if (state() === 'signedOut') {
          <button pcButton variant="primary" size="sm" type="button" data-testid="agent-sign-in" [disabled]="busy()" (click)="signIn()">
            @if (signingIn()) {
              <span class="spinner" aria-hidden="true"></span>{{ 'set.ag.signingin' | t }}
            } @else {
              <pc-icon name="log-in" />{{ 'set.ag.signin' | t }}
            }
          </button>
        }
        <button
          pcButton
          size="sm"
          type="button"
          data-testid="agent-test"
          [disabled]="state() !== 'connected' || busy()"
          (click)="test()"
        >
          @if (testing()) {
            <span class="spinner" aria-hidden="true"></span>{{ 'set.ag.testing' | t }}
          } @else {
            <pc-icon name="plug-zap" />{{ 'set.ag.test' | t }}
          }
        </button>
        <button
          pcButton
          variant="ghost"
          size="sm"
          type="button"
          [iconOnly]="true"
          data-testid="agent-refresh"
          [pcTooltip]="'set.ag.refresh' | t"
          [attr.aria-label]="'set.ag.refresh' | t"
          [disabled]="busy()"
          (click)="refresh()"
        >
          <pc-icon name="refresh-cw" />
        </button>
      </div>
    </div>

    <div class="cli-fields">
      <div class="cli-field">
        <label class="mini-label" [for]="'agent-bin-' + agent()">{{ 'set.ag.bin' | t }}</label>
        <div class="cli-bin">
          <input
            pcInput
            class="mono"
            [id]="'agent-bin-' + agent()"
            data-testid="agent-bin"
            [invalid]="invalid()"
            [placeholder]="'set.ag.bin.ph' | t"
            [value]="draft().binPath"
            (input)="form.patchAgent(agent(), { binPath: $any($event.target).value })"
          />
          <button pcButton size="sm" type="button" data-testid="agent-browse" (click)="browse()">
            <pc-icon name="folder-open" />{{ 'set.browse' | t }}
          </button>
        </div>
        <div class="cli-hint" data-testid="agent-bin-hint">
          @if (invalid()) {
            <span class="is-error">{{ 'set.ag.bin.missing' | t }}</span>
          } @else if (status(); as s) {
            @if (s.error) {
              <span class="is-error">{{ s.error }}</span>
            } @else if (s.source === 'detected') {
              {{ 'set.ag.bin.detected' | t }} <code>{{ s.binPath }}</code>
            } @else if (s.source === 'none') {
              {{ 'set.ag.bin.none' | t }} <code>{{ install() }}</code>
              {{ 'set.ag.bin.guide' | t }} <a class="cli-doc" [href]="docs()" (click)="openGuide($event)">{{ 'set.ag.docs' | t }}<pc-icon name="arrow-up-right" [size]="12" /></a>
            }
          }
        </div>
      </div>

      <div class="cli-field">
        <label class="mini-label" [for]="'agent-model-' + agent()">{{ 'set.ag.model' | t }}</label>
        <select
          pcInput
          [id]="'agent-model-' + agent()"
          data-testid="agent-model"
          [value]="draft().model"
          (change)="form.patchAgent(agent(), { model: $any($event.target).value })"
        >
          <option value="" [selected]="draft().model === ''">{{ 'set.ag.model.default' | t }}</option>
          @for (m of models(); track m.id) {
            <option [value]="m.id" [selected]="m.id === draft().model">{{ m.label }}</option>
          }
        </select>
      </div>
    </div>

    <div class="cli-auth-row">
      <div class="mini-label">{{ 'set.ag.auth' | t }}</div>
      <div class="cli-auth" data-testid="agent-auth">
        @if (status()?.auth; as auth) {
          @if (auth.signedIn) {
            <pc-badge tone="success"><pc-icon name="check" [size]="12" />{{ 'set.ag.signed' | t }}</pc-badge>
            <span class="cli-auth-d">{{ authLabel() }}</span>
            @if (auth.account; as account) {
              <span class="cli-auth-d">·</span><span class="cli-auth-d" data-testid="agent-account">{{ account }}</span>
            }
          } @else if (status()?.installed) {
            <pc-badge>{{ 'set.ag.signedout' | t }}</pc-badge>
          } @else {
            <span class="cli-auth-d">—</span>
          }
        }
      </div>
    </div>

    @if (status()?.home; as home) {
      <div class="cli-home-row">
        <div class="mini-label">{{ 'set.ag.home' | t }}</div>
        <div class="cli-home" data-testid="agent-home" [title]="home">
          <pc-icon name="folder" [size]="14" />
          <span class="cli-home-path">{{ home }}</span>
        </div>
        <div class="cli-hint">{{ 'set.ag.home.d' | t: { env: homeVar() } }}</div>
      </div>
    }

    <pc-dialog [(open)]="confirmSignOut" [title]="'set.ag.signout.t' | t: { name: name() }" width="min(460px, 100%)">
      <p class="text-sm" style="margin: 0">{{ 'set.ag.signout.d' | t: { name: name() } }}</p>
      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" type="button" (click)="confirmSignOut.set(false)">{{ 'common.cancel' | t }}</button>
        <button pcButton variant="danger" type="button" data-testid="agent-sign-out-confirm" (click)="signOut()">
          <pc-icon name="log-out" />{{ 'set.ag.signout' | t }}
        </button>
      </div>
    </pc-dialog>
  `,
})
export class AgentCardComponent {
  readonly agent = input.required<AgentId>();

  protected readonly form = inject(SettingsFormService);
  private readonly agents = inject(AgentsService);
  private readonly connections = inject(AgentConnectionsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly status = signal<AgentStatus | null>(null);
  protected readonly checking = signal(true);
  protected readonly testing = signal(false);
  protected readonly signingIn = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly confirmSignOut = signal(false);
  protected readonly busy = computed(() => this.checking() || this.testing() || this.signingIn() || this.signingOut());

  protected readonly name = computed(() => AGENT_NAMES[this.agent()]);
  protected readonly icon = computed(() => AGENT_ICONS[this.agent()]);
  protected readonly install = computed(() => AGENT_INSTALL[this.agent()]);
  protected readonly docs = computed(() => AGENT_DOCS[this.agent()]);
  protected readonly homeVar = computed(() => (this.agent() === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR'));
  protected readonly draft = computed(() => this.form.value().agents[this.agent()]);
  protected readonly isDefault = computed(() => this.form.value().agents.defaultAgent === this.agent());
  protected readonly invalid = computed(() => this.form.invalidField() === `${this.agent()}BinPath`);

  protected readonly state = computed<ConnectionState>(() => connectionState(this.status(), this.checking()));

  /** CLI models plus the stored value when the list does not offer it. */
  protected readonly models = computed<AgentModel[]>(() => {
    const list = this.status()?.models ?? [];
    const current = this.draft().model;
    return current && !list.some((m) => m.id === current) ? [...list, { id: current, label: current }] : list;
  });

  protected readonly authLabel = computed(() => {
    const auth = this.status()?.auth;
    if (!auth?.signedIn) return '';
    const method = this.i18n.t(auth.method === 'apiKey' ? 'set.ag.auth.key' : 'set.ag.auth.sub');
    return auth.plan ? `${method} · ${auth.plan}` : method;
  });

  /** Ignores answers to checks that were superseded by a newer one. */
  private requestId = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    let first = true;
    effect(() => {
      const binPath = this.draft().binPath;
      untracked(() => {
        clearTimeout(this.timer);
        if (first) {
          first = false;
          void this.check(binPath);
        } else {
          this.checking.set(true);
          this.timer = setTimeout(() => void this.check(binPath), RECHECK_DELAY_MS);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async openGuide(event: Event): Promise<void> {
    event.preventDefault();
    try {
      await this.agents.openInstallGuide(this.agent());
    } catch {
      this.toast.show(this.i18n.t('set.ag.docs.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  protected refresh(): void {
    clearTimeout(this.timer);
    void this.check(this.draft().binPath);
  }

  protected async browse(): Promise<void> {
    try {
      const picked = await this.agents.pickBinary(this.i18n.t('set.ag.bin.pick', { name: this.name() }), this.draft().binPath || this.status()?.binPath || null);
      if (picked) this.form.patchAgent(this.agent(), { binPath: picked });
    } catch {
      this.toast.show(this.i18n.t('set.browse.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  protected async test(): Promise<void> {
    if (this.busy()) return;
    this.testing.set(true);
    try {
      const { binPath, model } = this.draft();
      const result = await this.agents.test(this.agent(), binPath, model);
      const seconds = (result.durationMs / 1000).toLocaleString(this.i18n.lang(), { maximumFractionDigits: 1 });
      const message = this.i18n.t('set.ag.testok', { name: this.name(), s: seconds });
      this.toast.show(result.model ? `${message} · ${result.model}` : message, { icon: 'plug-zap', tone: 'success', duration: 5000 });
    } catch (error) {
      this.toast.show(this.failure('set.ag.testfail', error), { icon: 'circle-alert', tone: 'danger', duration: 7000 });
      if (error instanceof DesktopIpcError && (error.code === 'signedOut' || error.code === 'notInstalled')) this.refresh();
    } finally {
      this.testing.set(false);
    }
  }

  protected async signIn(): Promise<void> {
    if (this.busy()) return;
    this.signingIn.set(true);
    this.toast.show(this.i18n.t('set.ag.signin.hint', { name: this.name() }), { icon: 'log-in', duration: 6000 });
    try {
      const status = await this.agents.signIn(this.agent(), this.draft().binPath);
      this.accept(status);
      if (status.auth.signedIn) this.toast.show(this.i18n.t('set.ag.signedin', { name: this.name() }), { tone: 'success' });
    } catch (error) {
      this.toast.show(this.failure('set.ag.signin.fail', error), { icon: 'circle-alert', tone: 'danger', duration: 7000 });
    } finally {
      this.signingIn.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    this.confirmSignOut.set(false);
    if (this.busy()) return;
    this.signingOut.set(true);
    try {
      this.accept(await this.agents.signOut(this.agent(), this.draft().binPath));
      this.toast.show(this.i18n.t('set.ag.signedout.toast', { name: this.name() }), { icon: 'log-out', tone: 'warning' });
    } catch (error) {
      this.toast.show(this.failure('set.ag.signout.fail', error), { icon: 'circle-alert', tone: 'danger', duration: 7000 });
    } finally {
      this.signingOut.set(false);
    }
  }

  private async check(binPath: string): Promise<void> {
    const id = ++this.requestId;
    this.checking.set(true);
    try {
      const status = await this.agents.status(this.agent(), binPath);
      if (id === this.requestId) this.status.set(status);
      this.connections.publish(this.agent(), binPath, status);
    } catch (error) {
      if (id !== this.requestId) return;
      // Outside the desktop app (Storybook, browser): show the CLI as not found.
      this.status.set({
        agent: this.agent(),
        name: this.name(),
        binPath: binPath || null,
        source: binPath ? 'custom' : 'none',
        home: '',
        installed: false,
        version: null,
        auth: { signedIn: false, method: null, plan: null, account: null },
        models: [],
        error: error instanceof DesktopIpcError ? error.reason : String(error),
      });
    } finally {
      if (id === this.requestId) this.checking.set(false);
    }
  }

  /** Status returned by sign-in / sign-out, unless the path changed meanwhile. */
  private accept(status: AgentStatus): void {
    this.connections.publish(this.agent(), this.draft().binPath, status);
    this.requestId++;
    this.status.set(status);
    this.checking.set(false);
  }

  private failure(key: TranslationKey, error: unknown): string {
    if (error instanceof DesktopIpcError) {
      if (error.code === 'signedOut') return this.i18n.t('set.ag.err.signedout', { name: this.name() });
      if (error.code === 'timeout') return this.i18n.t('set.ag.err.timeout', { name: this.name() });
      return this.i18n.t(key, { name: this.name(), reason: error.reason });
    }
    return this.i18n.t(key, { name: this.name(), reason: String(error) });
  }
}

/** Agent Integration → AI & CLI tools: Claude Code and Codex CLI. */
@Component({
  selector: 'pc-agents-section',
  imports: [AgentCardComponent, IconComponent, TranslatePipe, ...SETTINGS_SECTION],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="agents" [title]="'set.n.agents' | t" [description]="'set.ag.d' | t">
      <div class="card cli-list">
        @for (agent of agents; track agent) {
          <pc-agent-card [agent]="agent" />
        }
        <div class="note-row"><pc-icon name="info" [size]="14" /><span>{{ 'set.ag.note' | t }}</span></div>
      </div>
    </pc-settings-section>
  `,
})
export class AgentsSectionComponent {
  protected readonly agents = AGENT_IDS;
}
