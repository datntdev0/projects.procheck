import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AvatarComponent } from '@components/avatar/avatar.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AGENT_NAMES } from '@features/agents/agents.service';
import type { ChatMessage } from '@features/chats/chats.model';
import type { AgentId } from '@features/settings/app-settings.model';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { clock, errorText } from './chat-format';
import { MarkdownComponent } from './markdown.component';

@Component({
  selector: 'pc-chat-message',
  imports: [RouterLink, AvatarComponent, ButtonComponent, IconComponent, TooltipDirective, TranslatePipe, MarkdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'm', '[class.user]': "message().role === 'user'", '[attr.data-testid]': "'chat-message-' + message().role" },
  template: `
    @if (message().role === 'user') {
      <div class="m-body">
        <div class="bubble">{{ message().text }}</div>
        <div class="m-meta"><span>{{ time() }}</span></div>
      </div>
    } @else {
      <pc-avatar [ai]="true" />
      <div class="m-body">
        <div class="m-meta">
          <b>{{ 'ch.assistant' | t }}</b><span class="cli-b" [class.codex]="agent() === 'codex'">{{ agentLabel() }}</span><span>{{ time() }}</span>
        </div>
        @if (message().text) {
          <pc-markdown [source]="message().text" />
        }
        @if (message().status === 'stopped') {
          <div class="m-note" data-testid="chat-stopped"><pc-icon name="circle-dot" [size]="14" />{{ 'ch.stopped' | t }}</div>
        }
        @if (error(); as error) {
          <div class="m-error" role="alert" data-testid="chat-error">
            <pc-icon name="circle-alert" [size]="16" />
            <div class="grow">
              <div>{{ error }}</div>
              @if (needsSettings()) {
                <a pcButton variant="secondary" size="sm" routerLink="/settings">
                  <pc-icon name="settings" />{{ 'ch.open.settings' | t }}
                </a>
              }
            </div>
          </div>
        }
        <div class="m-acts">
          @if (message().text) {
            <button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" [pcTooltip]="'ch.copy' | t" (click)="copy()">
              <pc-icon name="copy" [size]="14" />
            </button>
          }
          @if (retryable()) {
            <button pcButton variant="ghost" size="sm" type="button" data-testid="chat-retry" (click)="retry.emit()">
              <pc-icon name="rotate-ccw" [size]="14" />{{ 'ch.retry' | t }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class ChatMessageComponent {
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  readonly message = input.required<ChatMessage>();
  readonly agent = input.required<AgentId>();
  readonly canRetry = input(false);
  readonly retry = output<void>();

  protected readonly time = computed(() => clock(this.message().at));
  protected readonly agentLabel = computed(() => AGENT_NAMES[this.agent()]);
  protected readonly retryable = computed(() => this.canRetry() && this.message().status !== 'complete');
  protected readonly needsSettings = computed(() => ['signedOut', 'notInstalled'].includes(this.message().error?.code ?? ''));
  protected readonly error = computed(() => {
    const error = this.message().error;
    return error ? errorText(this.i18n, this.agent(), error) : null;
  });

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.message().text);
      this.toast.show(this.i18n.t('ch.copied'));
    } catch (error) {
      console.error('Could not copy', error);
    }
  }
}
