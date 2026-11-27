import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { BadgeComponent } from '@components/badge/badge.component';
import { StatusDotComponent } from '@components/badge/status-dot.component';
import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_DOCS, AGENT_NAMES, AgentModel, AgentStatus, AgentsService, ConnectionState } from '@features/agents/agents.service';
import { isWorking } from '@features/tools/tools.model';
import { progressLine } from '@features/tools/tools.format';
import { ToolsStore } from '@features/tools/tools.store';
import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import { formatBytes } from '@shared/format/bytes';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SettingsFormService } from '../settings-form.service';
import { SETTINGS_SECTION } from '../settings-section.component';

const AGENT_ICONS: Record<AgentId, string> = { claude: 'bot-message-square', codex: 'square-terminal' };

/** One CLI: status, default flag, download / update, sign-in, connection test and default model. */
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
      <pc-icon class="cli-glyph" [name]="icon()" [size]="16" />
      <div class="cli-title">
        <div class="cname">
          {{ name() }}
          @if (isDefault()) {
            <pc-badge tone="brand" data-testid="agent-default-badge">{{ 'set.ag.default' | t }}</pc-badge>
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
        @if (!working()) {
          @if (!installed()) {
            <button pcButton variant="primary" size="sm" type="button" data-testid="agent-download" [disabled]="tools.installing()" (click)="install()">
              <pc-icon name="download" />{{ 'set.ag.download' | t: { s: size() } }}
            </button>
          } @else {
            @if (outdated()) {
              <button pcButton variant="primary" size="sm" type="button" data-testid="agent-update" [disabled]="tools.installing()" (click)="install()">
                <pc-icon name="download" />{{ 'set.ag.update' | t: { v: bundled() } }}
              </button>
            }
            <button pcButton variant="ghost" size="sm" type="button" data-testid="agent-reinstall" [disabled]="tools.installing()" (click)="install()">
              <pc-icon name="rotate-ccw" />{{ 'set.ag.reinstall' | t }}
            </button>
          }
        }
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
          <button pcButton size="sm" type="button" data-testid="agent-sign-in" [disabled]="busy()" (click)="signIn()">
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

    @if (view(); as v) {
      <div class="cli-install" data-testid="agent-progress">
        <div class="progress" [class.indet]="!v.determinate"><span [style.width.%]="v.percent"></span></div>
        <div class="cli-install-row">
          <span>{{ line() }}</span>
          <span class="grow"></span>
          @if (v.determinate) {
            <span>{{ v.percent }}%</span>
          }
          <button pcButton variant="ghost" size="sm" type="button" data-testid="agent-cancel" [disabled]="v.state !== 'downloading'" (click)="tools.cancel()">
            {{ 'sp.cancel' | t }}
          </button>
        </div>
      </div>
    } @else if (installError(); as failure) {
      <div class="cli-install is-error" data-testid="agent-install-error">
        <span>{{ failureText() }} <code>{{ failure.code }}</code></span>
      </div>
    }

    <dl class="cli-kv">
      <dt>{{ 'set.ag.bundled' | t }}</dt>
      <dd data-testid="agent-bundled">
        @if (bundled()) {
          <span>v{{ bundled() }}</span>
          @if (size()) {
            <span class="cli-auth-d">· {{ size() }}</span>
          }
        } @else {
          <span class="cli-auth-d">—</span>
        }
      </dd>

      <dt>{{ 'set.ag.installed' | t }}</dt>
      <dd data-testid="agent-installed">
        @if (installed()) {
          <span>v{{ status()?.version }}</span>
          @if (outdated()) {
            <pc-badge tone="warning">{{ 'set.ag.outdated' | t }}</pc-badge>
          }
        } @else {
          <span class="cli-auth-d">{{ 'set.ag.notdl' | t }}</span>
        }
        @if (status()?.error; as error) {
          <span class="cli-hint is-error">{{ error }}</span>
        }
      </dd>

      <dt>{{ 'set.ag.auth' | t }}</dt>
      <dd class="cli-auth" data-testid="agent-auth">
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
      </dd>

      <dt><label [for]="'agent-model-' + agent()">{{ 'set.ag.model' | t }}</label></dt>
      <dd>
        <select
          pcInput
          class="cli-model"
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
      </dd>

      @if (status()?.home; as home) {
        <dt>{{ 'set.ag.home' | t }}</dt>
        <dd>
          <span class="path" data-testid="agent-home" [title]="home">{{ home }}</span>
          <span class="cli-hint">{{ 'set.ag.home.d' | t: { env: homeVar() } }}</span>
        </dd>
      }
    </dl>

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
  protected readonly tools = inject(ToolsStore);
  private readonly agents = inject(AgentsService);
  private readonly connections = inject(AgentConnectionsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly testing = signal(false);
  protected readonly signingIn = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly confirmSignOut = signal(false);

  protected readonly status = computed<AgentStatus | null>(() => this.connections.status(this.agent()));
  protected readonly state = computed<ConnectionState>(() => this.connections.state(this.agent()));
  protected readonly checking = computed(() => this.state() === 'checking');
  protected readonly busy = computed(() => this.checking() || this.testing() || this.signingIn() || this.signingOut() || this.working());

  protected readonly name = computed(() => AGENT_NAMES[this.agent()]);
  protected readonly icon = computed(() => AGENT_ICONS[this.agent()]);
  protected readonly docs = computed(() => AGENT_DOCS[this.agent()]);
  protected readonly homeVar = computed(() => (this.agent() === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR'));
  protected readonly draft = computed(() => this.form.value().agents[this.agent()]);
  protected readonly isDefault = computed(() => this.form.value().agents.defaultAgent === this.agent());

  // The bundled copy: what is installed, what Procheck ships, and the install in progress.
  private readonly item = computed(() => this.tools.item(this.agent()));
  protected readonly installed = computed(() => !!this.status()?.installed);
  protected readonly outdated = computed(() => !!this.status()?.outdated);
  protected readonly bundled = computed(() => this.status()?.bundledVersion || this.item()?.version || '');
  protected readonly size = computed(() => (this.item() ? formatBytes(this.item()!.size) : ''));
  protected readonly working = computed(() => !!this.item() && isWorking(this.item()!.state));
  protected readonly view = computed(() => this.tools.view(this.agent()));
  protected readonly line = computed(() => {
    const view = this.view();
    return view ? progressLine(this.i18n, view) : '';
  });
  /** The last install of this CLI failed (a cancelled download is not an error). */
  protected readonly installError = computed(() => {
    const item = this.item();
    return item?.state === 'error' && item.error && item.error.code !== 'cancelled' ? item.error : null;
  });
  protected readonly failureText = computed(() => {
    const code = this.installError()?.code;
    return this.i18n.t(code && INSTALL_ERRORS[code] ? INSTALL_ERRORS[code] : 'sp.err.other');
  });

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

  constructor() {
    // The CLI status was read at startup; read it again when a download of this CLI has finished.
    effect(() => {
      if (this.item()?.state === 'ready') untracked(() => void this.connections.check(this.agent()));
    });
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
    void this.connections.check(this.agent());
  }

  /** Download, update or reinstall: all install the bundled version. */
  protected install(): void {
    void this.tools.install([this.agent()]);
  }

  protected async test(): Promise<void> {
    if (this.busy()) return;
    this.testing.set(true);
    try {
      const result = await this.agents.test(this.agent(), this.draft().model);
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
      const status = await this.agents.signIn(this.agent());
      this.connections.publish(this.agent(), status);
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
      this.connections.publish(this.agent(), await this.agents.signOut(this.agent()));
      this.toast.show(this.i18n.t('set.ag.signedout.toast', { name: this.name() }), { icon: 'log-out', tone: 'warning' });
    } catch (error) {
      this.toast.show(this.failure('set.ag.signout.fail', error), { icon: 'circle-alert', tone: 'danger', duration: 7000 });
    } finally {
      this.signingOut.set(false);
    }
  }

  private failure(key: TranslationKey, error: unknown): string {
    if (error instanceof DesktopIpcError) {
      if (error.code === 'signedOut') return this.i18n.t('set.ag.err.signedout', { name: this.name() });
      if (error.code === 'timeout') return this.i18n.t('set.ag.err.timeout', { name: this.name() });
      if (error.code === 'notInstalled') return this.i18n.t('set.ag.err.notinstalled', { name: this.name() });
      return this.i18n.t(key, { name: this.name(), reason: error.reason });
    }
    return this.i18n.t(key, { name: this.name(), reason: String(error) });
  }
}

const INSTALL_ERRORS: Record<string, TranslationKey> = {
  network: 'sp.err.network',
  checksum: 'sp.err.checksum',
  diskFull: 'sp.err.diskFull',
  extract: 'sp.err.extract',
  io: 'sp.err.io',
};

/** Agent Integration → AI & CLI tools: Claude Code and Codex CLI. */
@Component({
  selector: 'pc-agents-section',
  imports: [AgentCardComponent, IconComponent, TranslatePipe, ...SETTINGS_SECTION],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section sectionId="agents" [title]="'set.n.agents' | t" [description]="'set.ag.d' | t">
      @for (agent of agents; track agent) {
        <pc-agent-card [agent]="agent" />
      }
      <div class="note-row"><pc-icon name="info" [size]="14" /><span>{{ 'set.ag.note' | t }}</span></div>
    </pc-settings-section>
  `,
})
export class AgentsSectionComponent implements OnInit {
  private readonly tools = inject(ToolsStore);
  protected readonly agents = AGENT_IDS;

  ngOnInit(): void {
    // Which CLIs are downloaded can change outside the app; read it when the page opens.
    if (!this.tools.installing()) void this.tools.check();
  }
}
