import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';

import { BadgeComponent } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_NAMES } from '@features/agents/agents.service';
import { ChatSummary, LimitWindow, UsageLimits, contextPercent, contextUsed, usageTone } from '@features/chats/chats.model';
import { ChatsService } from '@features/chats/chats.service';
import type { AgentId } from '@features/settings/app-settings.model';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { clock, compactNumber, dateTimeLabel, timeLeft } from './chat-format';

const RING_RADIUS = 7;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

interface WindowRow {
  label: TranslationKey;
  short: TranslationKey;
  percent: number;
  tone: string;
  resets: string | null;
}

/** Usage strip above the composer; opens the context window, usage limits and chat details. */
@Component({
  selector: 'pc-chat-usage',
  imports: [BadgeComponent, ButtonComponent, IconComponent, TooltipDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'usage-host',
    '(document:mousedown)': 'onDocumentDown($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button type="button" class="as-usage" data-testid="chat-usage" [pcTooltip]="'use.tip' | t: { cli: agentName() }" (click)="toggle()">
      <svg [class]="'u-ring ' + contextTone()" viewBox="0 0 18 18" width="14" height="14">
        <circle class="bg" cx="9" cy="9" [attr.r]="radius" fill="none" stroke-width="2.5" />
        <circle class="fg" cx="9" cy="9" [attr.r]="radius" fill="none" stroke-width="2.5" stroke-linecap="round" [attr.stroke-dasharray]="ringDash()" />
      </svg>
      <span>{{ 'use.context' | t }} <b data-testid="chat-usage-context">{{ contextLabel() }}</b></span>
      @for (row of windows(); track row.label) {
        <span class="u-sep"></span>
        <span [class.text-warning]="row.tone === 'warn'" [class.text-danger]="row.tone === 'danger'">{{ row.short | t }} <b>{{ row.percent }}%</b></span>
      }
      <pc-icon name="chevron-up" [size]="14" style="margin-left: auto" />
    </button>

    @if (open()) {
      <div class="ctx-pop" role="dialog" data-testid="chat-usage-popover">
        <div>
          <div class="cx-h">
            <span>{{ 'use.context' | t }}</span>
            @if (context(); as ctx) {
              <span class="cx-v">{{ compact(used()) }}{{ ctx.window ? ' / ' + compact(ctx.window) + ' · ' + contextLabel() : '' }}</span>
            }
          </div>
          @if (context(); as ctx) {
            @if (ctx.window) {
              <div class="tokbar">
                <i class="cr" [style.width.%]="(ctx.cacheRead / ctx.window) * 100"></i>
                <i class="nw" [style.width.%]="(ctx.newInput / ctx.window) * 100"></i>
                <i class="ou" [style.width.%]="(ctx.output / ctx.window) * 100"></i>
              </div>
            }
            <div class="kv"><span class="k"><i class="dotk cr"></i>{{ 'use.cached' | t }}</span><span class="v">{{ number(ctx.cacheRead) }}</span></div>
            <div class="kv"><span class="k"><i class="dotk nw"></i>{{ 'use.new' | t }}</span><span class="v">{{ number(ctx.newInput) }}</span></div>
            <div class="kv"><span class="k"><i class="dotk ou"></i>{{ 'use.out' | t }}</span><span class="v">{{ number(ctx.output) }}</span></div>
            <div class="u-sub">
              @if (ctx.at) {
                {{ 'use.last' | t: { t: time(ctx.at) } }} ·
              }
              @if (!ctx.window) {
                {{ 'use.window.unknown' | t }} ·
              }
              {{ 'use.compact.hint' | t }}
            </div>
            @if (contextTone()) {
              <div class="cx-warn"><pc-icon name="triangle-alert" [size]="14" /><span>{{ 'use.compact.warn' | t }}</span></div>
            }
          } @else {
            <div class="u-sub">{{ 'use.none' | t }}</div>
          }

          <div class="cx-h">
            <span>{{ 'use.limits' | t }} · {{ agentName() }}</span>
            @if (plan(); as plan) {
              <pc-badge>{{ plan }}</pc-badge>
            }
          </div>
          @if (limits(); as limits) {
            @for (row of windows(); track row.label) {
              <div class="u-row">
                <div class="u-top">
                  <span>{{ row.label | t }}</span>
                  <b [class.text-warning]="row.tone === 'warn'" [class.text-danger]="row.tone === 'danger'">{{ row.percent }}%</b>
                </div>
                <div [class]="'u-bar ' + row.tone"><i [style.width.%]="row.percent"></i></div>
                @if (row.resets) {
                  <div class="u-sub">{{ row.resets }}</div>
                }
              </div>
            }
            <div class="u-sub" style="margin-top: 8px">{{ 'use.updated' | t: { t: dateTime(limits.at) } }}</div>
            <div class="u-sub">{{ 'use.account' | t }}</div>
          } @else {
            <div class="u-sub">{{ 'use.nolimits' | t }}</div>
          }

          @if (chat(); as chat) {
            <div class="cx-h">{{ 'ch.ctx.totals' | t }}</div>
            <div class="kv"><span class="k">{{ 'ch.ctx.in' | t }}</span><span class="v">{{ number(chat.usage.totals.input) }}</span></div>
            <div class="kv"><span class="k">{{ 'ch.ctx.out' | t }}</span><span class="v">{{ number(chat.usage.totals.output) }}</span></div>
            <div class="kv"><span class="k">{{ 'ch.ctx.cache' | t }}</span><span class="v">{{ number(chat.usage.totals.cacheRead) }}</span></div>
            @if (chat.usage.costUsd !== null) {
              <div class="kv"><span class="k">{{ 'ch.ctx.cost' | t }}</span><span class="v">{{ cost(chat.usage.costUsd) }}</span></div>
            }
          }
        </div>

        <div>
          <div class="cx-h">{{ 'ch.ctx.context' | t }}</div>
          <div class="kv">
            <span class="k">{{ 'ch.ctx.scope' | t }}</span>
            <span class="v row gap-1"><span class="sc-av none"><pc-icon name="globe" /></span>{{ 'ch.scope.none' | t }}</span>
          </div>
          <div class="kv"><span class="k">{{ 'ch.ctx.messages' | t }}</span><span class="v">{{ chat()?.messageCount ?? 0 }}</span></div>

          <div class="cx-h">{{ 'ch.ctx.runtime' | t }}</div>
          <div class="kv">
            <span class="k">{{ 'ch.ctx.cli' | t }}</span>
            <span class="v">{{ agentName() }}
              @if (status()?.version; as version) {
                <span class="text-faint" style="font-weight: 400">{{ version }}</span>
              }
            </span>
          </div>
          <div class="kv"><span class="k">{{ 'ch.ctx.model' | t }}</span><span class="v mono" style="font-size: 12px">{{ model() ?? ('ch.model.default' | t) }}</span></div>

          @if (chats.paths(); as paths) {
            <div class="cx-h">{{ 'ch.ctx.dir' | t }}</div>
            <div class="path"><span>{{ paths.workingDir }}</span><button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" [pcTooltip]="'ch.ctx.copy' | t" (click)="copy(paths.workingDir)"><pc-icon name="copy" [size]="14" /></button></div>

            <div class="cx-h">
              <span>{{ 'ch.ctx.home' | t }}</span>
              <pc-badge tone="success"><pc-icon name="shield-check" [size]="12" />{{ 'ch.ctx.isolated' | t }}</pc-badge>
            </div>
            <div class="path"><span>{{ home() }}</span><button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" [pcTooltip]="'ch.ctx.copy' | t" (click)="copy(home())"><pc-icon name="copy" [size]="14" /></button></div>
            <div class="note"><pc-icon name="lock-keyhole" [size]="13" /><span>{{ 'ch.ctx.home.note' | t }}</span></div>

            <div class="cx-h">{{ 'ch.ctx.sid' | t }}</div>
            @if (chat()?.sessionId; as sid) {
              <div class="path" data-testid="chat-session-id"><span>{{ sid }}</span><button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" [pcTooltip]="'ch.ctx.copy' | t" (click)="copy(sid)"><pc-icon name="copy" [size]="14" /></button></div>
            } @else {
              <div class="u-sub">{{ 'ch.ctx.sid.none' | t }}</div>
            }

            @if (transcript(); as transcript) {
              <div class="cx-h">{{ 'ch.ctx.chat' | t }}</div>
              <div class="path"><span>{{ transcript }}</span><button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" [pcTooltip]="'ch.ctx.copy' | t" (click)="copy(transcript)"><pc-icon name="copy" [size]="14" /></button></div>
            }
            <div class="note"><pc-icon name="folder-open" [size]="13" /><span>{{ 'ch.ctx.chat.note' | t }}</span></div>
          }
        </div>
      </div>
    }
  `,
})
export class ChatUsageComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly chats = inject(ChatsService);
  private readonly connections = inject(AgentConnectionsService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly chat = input<ChatSummary | null>(null);
  readonly agent = input.required<AgentId>();
  readonly model = input<string | null>(null);

  protected readonly open = signal(false);
  protected readonly radius = RING_RADIUS;

  protected readonly agentName = computed(() => AGENT_NAMES[this.agent()]);
  protected readonly context = computed(() => this.chat()?.usage.context ?? null);
  protected readonly used = computed(() => contextUsed(this.context()));
  protected readonly percent = computed(() => contextPercent(this.context()));
  protected readonly contextLabel = computed(() => {
    const percent = this.percent();
    return percent === null ? '—' : `${Math.round(percent)}%`;
  });
  protected readonly contextTone = computed(() => usageTone(this.percent() ?? 0));
  protected readonly ringDash = computed(() => `${((RING_LENGTH * (this.percent() ?? 0)) / 100).toFixed(1)} ${RING_LENGTH.toFixed(1)}`);
  protected readonly limits = computed<UsageLimits | null>(() => this.chats.limitsOf(this.agent()));
  protected readonly windows = computed<WindowRow[]>(() => (this.limits()?.windows ?? []).map((w) => this.windowRow(w)));
  protected readonly status = computed(() => this.connections.status(this.agent()));
  protected readonly plan = computed(() => this.limits()?.plan ?? this.status()?.auth.plan ?? null);
  protected readonly home = computed(() => this.status()?.home ?? `${this.chats.paths()?.cliDir ?? ''}\\${this.agent()}`);
  protected readonly transcript = computed(() => {
    const chat = this.chat();
    const dir = this.chats.paths()?.chatsDir;
    return chat && dir ? `${dir}\\${chat.id}.jsonl` : null;
  });

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected number(value: number): string {
    return value.toLocaleString('en-US');
  }

  protected compact(value: number): string {
    return compactNumber(value);
  }

  protected cost(value: number): string {
    return `$${value.toFixed(2)}`;
  }

  protected time(iso: string): string {
    return clock(iso);
  }

  protected dateTime(iso: string): string {
    return dateTimeLabel(iso, this.i18n.lang());
  }

  protected async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.toast.show(this.i18n.t('ch.copied'));
    } catch (error) {
      console.error('Could not copy', error);
    }
  }

  protected onDocumentDown(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }

  private windowRow(window: LimitWindow): WindowRow {
    const percent = Math.round(window.usedPercent);
    return {
      label: `use.w.${window.kind}` as TranslationKey,
      short: `use.w.${window.kind}.short` as TranslationKey,
      percent,
      tone: usageTone(percent),
      resets: window.resetsAt
        ? this.i18n.t('use.resets', { t: dateTimeLabel(window.resetsAt, this.i18n.lang()), d: timeLeft(window.resetsAt) })
        : null,
    };
  }
}
