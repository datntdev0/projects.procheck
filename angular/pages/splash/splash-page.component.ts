import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastStackComponent } from '@components/toast/toast-stack.component';
import { ToastService } from '@components/toast/toast.service';
import { AGENT_NAMES } from '@features/agents/agents.service';
import { StorageService } from '@features/storage/storage.service';
import { TOOL_IDS, ToolId, ToolItem, isWorking } from '@features/tools/tools.model';
import { progressLine } from '@features/tools/tools.format';
import { ToolsStore } from '@features/tools/tools.store';
import { APP_NAME, APP_VERSION } from '@shared/app/app-version';
import { formatBytes } from '@shared/format/bytes';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';
import { ThemeService } from '@shared/theme/theme.service';

type SplashState = 'checking' | 'missing' | 'running' | 'failed' | 'ready';

/** Pause after "Ready" before the app opens by itself. */
const READY_DELAY_MS = 1200;

const STATE_ICON: Record<SplashState, { tone: string; icon: string }> = {
  checking: { tone: '', icon: '' },
  missing: { tone: 'brand', icon: 'download' },
  running: { tone: 'brand', icon: 'download' },
  failed: { tone: 'err', icon: 'triangle-alert' },
  ready: { tone: 'ok', icon: 'circle-check' },
};

const TOOL_ICON: Record<ToolId, string> = { git: 'git-branch', claude: 'sparkles', codex: 'terminal' };
const WORKING_ICON: Record<string, string> = { downloading: 'download', verifying: 'shield-check', extracting: 'package-open', configuring: 'settings-2' };

interface ToolRow {
  id: ToolId;
  item: ToolItem | null;
  icon: string;
  name: string;
  meta: string;
}

/**
 * Splash screen (ported from _proto/splash.html), outside the app layout: checks the tools Procheck bundles. Only Git
 * is required and downloaded here (on click); Claude Code and Codex are downloaded in Settings → Agent integration.
 * Once Git is ready the app opens by itself.
 */
@Component({
  selector: 'pc-splash-page',
  imports: [ButtonComponent, IconComponent, RouterLink, ToastStackComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="splash" [attr.data-state]="state()" data-testid="splash-page">
      <div class="sp-corner">
        <button pcButton variant="ghost" size="sm" type="button" data-testid="splash-lang" (click)="i18n.toggle()">
          <pc-icon name="languages" [size]="14" />{{ i18n.lang() === 'en' ? 'Tiếng Việt' : 'English' }}
        </button>
        <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" data-testid="splash-theme" [attr.aria-label]="'shell.theme' | t" (click)="theme.toggle()">
          <pc-icon name="sun-moon" [size]="14" />
        </button>
      </div>

      <div class="sp-brand">
        <div class="sp-mark"><img src="assets/brand/kms-mark.svg" alt="" /></div>
        <div>
          <div class="sp-name">{{ appName }}</div>
          <div class="sp-ver">{{ 'sp.ver' | t }} {{ version }} · {{ 'app.by' | t }}</div>
        </div>
      </div>

      <section class="card sp-card" data-testid="splash-card">
        <div class="sp-head">
          <span class="st-ic" [class]="head().tone">
            @if (state() === 'checking') {
              <span class="spinner" aria-hidden="true"></span>
            } @else {
              <pc-icon [name]="head().icon" [size]="16" />
            }
          </span>
          <div>
            <h1 data-testid="splash-title">{{ 'sp.t.' + state() | t }}</h1>
            <p>{{ 'sp.d.' + state() | t }}</p>
          </div>
        </div>

        <ul class="tools">
          @for (row of rows(); track row.id) {
            <li class="tool" [class.is-dim]="row.id !== 'git' && row.item?.state !== 'ready' && state() !== 'checking'" [attr.data-tool]="row.id">
              <span class="t-ic"><pc-icon [name]="row.icon" [size]="16" /></span>
              <div class="t-main">
                <div class="t-name">
                  {{ row.name }}
                  @if (row.item?.required) {
                    <span class="badge badge-brand">{{ 'sp.req' | t }}</span>
                  } @else {
                    <span class="badge">{{ 'sp.opt' | t }}</span>
                  }
                </div>
                <div class="t-role">{{ 'sp.' + row.id + '.r' | t }} · <span class="t-meta">{{ row.meta }}</span></div>
              </div>

              @if (row.id === 'git') {
                @switch (gitStatus()) {
                  @case ('checking') {
                    <span class="t-st wait"><span class="spinner" aria-hidden="true"></span>{{ 'sp.s.checking' | t }}</span>
                  }
                  @case ('ready') {
                    <span class="t-st ok" data-testid="splash-git-state"><pc-icon name="circle-check" [size]="15" />{{ 'sp.s.ready' | t }}</span>
                  }
                  @case ('error') {
                    <span class="t-st err" data-testid="splash-git-state"><pc-icon name="circle-x" [size]="15" />{{ 'sp.s.error' | t }}</span>
                  }
                  @case ('missing') {
                    <span class="t-st wait" data-testid="splash-git-state"><pc-icon name="circle-dashed" [size]="15" />{{ 'sp.s.missing' | t }}</span>
                  }
                  @default {
                    <span class="t-st" data-testid="splash-git-state"><pc-icon [name]="workingIcon()" [size]="15" />{{ 'sp.s.' + gitStatus() | t }}</span>
                  }
                }
              } @else if (state() === 'checking') {
                <span class="t-st wait"><span class="spinner" aria-hidden="true"></span>{{ 'sp.s.checking' | t }}</span>
              } @else if (row.item?.state === 'ready' || row.item?.state === 'outdated') {
                <span class="t-st ok" [attr.data-testid]="'splash-' + row.id + '-state'"><pc-icon name="circle-check" [size]="15" />{{ 'sp.s.ready' | t }}</span>
              } @else {
                <span class="t-st later" [attr.data-testid]="'splash-' + row.id + '-state'">
                  <pc-icon name="clock" [size]="15" />{{ 'sp.s.later' | t }} <a routerLink="/settings" fragment="agents">{{ 'sp.s.later.link' | t }}</a>
                </span>
              }

              @if (row.id === 'git' && working()) {
                <div class="t-prog" data-testid="splash-progress">
                  <div class="progress" [class.indet]="!determinate()"><span [style.width.%]="percent()"></span></div>
                  <div class="row-x">
                    <span>{{ progressLine() }}</span>
                    <span>{{ determinate() ? percent() + '%' : '' }}</span>
                  </div>
                </div>
              }
            </li>
          }
        </ul>

        @if (state() === 'failed') {
          <div class="sp-err" role="alert" data-testid="splash-error">
            <pc-icon [name]="errorCode() === 'network' ? 'wifi-off' : 'circle-alert'" [size]="15" />
            <span>
              {{ errorText() }} @if (errorCode()) { <code>{{ errorCode() }}</code> }
              @if (errorDetail(); as detail) {
                <span class="sp-err-detail">{{ detail }}</span>
              }
            </span>
          </div>
        } @else if (cancelled()) {
          <div class="sp-err is-muted" data-testid="splash-cancelled">
            <pc-icon name="pause" [size]="15" /><span>{{ 'sp.cancelled' | t }}</span>
          </div>
        }

        <div class="sp-foot">
          <span class="where">{{ 'sp.where' | t }} <code>{{ toolsDir() }}</code></span>
          <span class="grow"></span>
          @switch (state()) {
            @case ('missing') {
              <button pcButton variant="ghost" size="sm" type="button" data-testid="splash-quit" (click)="quit()">{{ 'sp.quit' | t }}</button>
              <button pcButton variant="primary" size="sm" type="button" data-testid="splash-download" (click)="download()">
                <pc-icon name="download" [size]="14" />{{ 'sp.download' | t: { s: gitSize() } }}
              </button>
            }
            @case ('running') {
              <button pcButton size="sm" type="button" data-testid="splash-cancel" [disabled]="!cancellable()" (click)="tools.cancel()">{{ 'sp.cancel' | t }}</button>
            }
            @case ('failed') {
              <button pcButton variant="ghost" size="sm" type="button" data-testid="splash-logs" (click)="openLogs()">
                <pc-icon name="file-text" [size]="14" />{{ 'sp.logs' | t }}
              </button>
              <button pcButton variant="ghost" size="sm" type="button" data-testid="splash-quit" (click)="quit()">{{ 'sp.quit' | t }}</button>
              <button pcButton variant="primary" size="sm" type="button" data-testid="splash-retry" (click)="retry()">
                <pc-icon name="rotate-cw" [size]="14" />{{ 'sp.retry' | t }}
              </button>
            }
            @case ('ready') {
              <button pcButton variant="primary" size="sm" type="button" data-testid="splash-open" (click)="open()">
                {{ 'sp.open' | t }}<pc-icon name="arrow-right" [size]="14" />
              </button>
            }
          }
        </div>
      </section>

      @if (state() !== 'checking') {
        <div class="sp-note">
          <pc-icon name="info" [size]="14" />
          <span>{{ 'sp.note.cli' | t }} {{ 'sp.note.git' | t: { path: gitConfig() } }}</span>
        </div>
      }
    </div>
    <pc-toast-stack />
  `,
})
export class SplashPageComponent implements OnInit {
  protected readonly tools = inject(ToolsStore);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  protected readonly appName = APP_NAME;
  protected readonly version = APP_VERSION;

  private readonly git = computed(() => this.tools.item('git'));
  protected readonly gitStatus = computed(() => (this.state() === 'checking' ? 'checking' : (this.git()?.state ?? 'missing')));
  protected readonly working = computed(() => !!this.git() && isWorking(this.git()!.state));

  /** What the screen shows: Git ready wins, then an install in progress, then a failure. */
  protected readonly state = computed<SplashState>(() => {
    if (this.tools.gitReady()) return 'ready';
    if (this.tools.installing() || this.working()) return 'running';
    if (this.tools.checkError() || (this.git()?.state === 'error' && this.git()?.error?.code !== 'cancelled')) return 'failed';
    if (!this.tools.checked() || (this.tools.checking() && !this.tools.snapshot())) return 'checking';
    return 'missing';
  });
  protected readonly head = computed(() => STATE_ICON[this.state()]);

  protected readonly rows = computed<ToolRow[]>(() =>
    TOOL_IDS.map((id) => {
      const item = this.tools.item(id);
      const name = id === 'git' ? 'Git' : AGENT_NAMES[id].replace(' CLI', '');
      const version = item ? (id === 'git' ? `${item.installedVersion ?? item.version} · ${formatBytes(item.size)}` : item.version) : '';
      return { id, item, icon: TOOL_ICON[id], name, meta: version };
    }),
  );

  protected readonly gitSize = computed(() => formatBytes(this.git()?.size ?? 0));
  protected readonly toolsDir = computed(() => `${this.tools.dataDir() || '%LOCALAPPDATA%\\Procheck'}\\tools\\`);
  protected readonly gitConfig = computed(() => `${this.tools.dataDir() || '%LOCALAPPDATA%\\Procheck'}\\git\\config`);
  protected readonly workingIcon = computed(() => WORKING_ICON[this.git()?.state ?? ''] ?? 'download');

  /** The user cancelled the last download: it can resume from where it stopped. */
  protected readonly cancelled = computed(() => this.state() === 'missing' && this.git()?.error?.code === 'cancelled');
  protected readonly cancellable = computed(() => this.git()?.state === 'downloading');

  private readonly view = computed(() => this.tools.view('git'));
  protected readonly determinate = computed(() => !!this.view()?.determinate);
  protected readonly percent = computed(() => this.view()?.percent ?? 0);
  protected readonly progressLine = computed(() => {
    const view = this.view();
    return view ? progressLine(this.i18n, view) : '';
  });

  protected readonly errorCode = computed(() => this.tools.checkError()?.code ?? this.git()?.error?.code ?? null);
  protected readonly errorText = computed(() => {
    const code = this.errorCode();
    const known = code && ERROR_KEYS[code];
    return this.i18n.t(known ?? 'sp.err.other');
  });
  protected readonly errorDetail = computed(() => this.tools.checkError()?.message ?? this.git()?.error?.message ?? '');

  constructor() {
    // Ready: the app opens by itself after a short moment.
    effect((onCleanup) => {
      if (this.state() !== 'ready') return;
      const timer = setTimeout(() => untracked(() => this.open()), READY_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    if (!this.tools.checked() && !this.tools.checking()) void this.tools.check();
  }

  protected download(): void {
    void this.tools.install(['git']);
  }

  protected retry(): void {
    // A failed check (not an install) is checked again; otherwise the download is resumed.
    if (this.tools.checkError() && !this.tools.snapshot()) void this.tools.check();
    else void this.tools.install(['git']);
  }

  protected open(): void {
    void this.router.navigateByUrl('/projects', { replaceUrl: true });
  }

  protected async openLogs(): Promise<void> {
    try {
      await this.storage.open('logs');
    } catch {
      this.toast.show(this.i18n.t('set.st.open.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  protected async quit(): Promise<void> {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error('Could not close the window', error);
    }
  }
}

const ERROR_KEYS: Record<string, TranslationKey> = {
  network: 'sp.err.network',
  checksum: 'sp.err.checksum',
  diskFull: 'sp.err.diskFull',
  extract: 'sp.err.extract',
  io: 'sp.err.io',
  busy: 'sp.err.busy',
};
