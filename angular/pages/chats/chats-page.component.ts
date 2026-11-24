import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AvatarComponent } from '@components/avatar/avatar.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AGENT_NAMES } from '@features/agents/agents.service';
import { ChatScopesService } from '@features/chats/chat-scopes.service';
import type { ChatMessage, ChatScope } from '@features/chats/chats.model';
import { ChatsService } from '@features/chats/chats.service';
import type { AgentId } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ChatComposerComponent } from './chat-composer.component';
import { ChatHistoryComponent } from './chat-history.component';
import { ChatScopePickerComponent } from './chat-scope-picker.component';
import { displayedModel, lastOf, promptBefore, reportChatError, reportSendError, scrollThreadToEnd } from './chat-thread';
import { ChatMessageComponent } from './chat-message.component';
import { ChatUsageComponent } from './chat-usage.component';
import { MarkdownComponent } from './markdown.component';

export const DRAFT_ROUTE_ID = 'new';

interface Suggestion {
  icon: string;
  title: TranslationKey;
  detail: TranslationKey;
  prompt: TranslationKey;
}

const PROJECT_SUGGESTIONS: Suggestion[] = [
  { icon: 'folder-search', title: 'ch.psg1', detail: 'ch.psg1.d', prompt: 'ch.psg1.p' },
  { icon: 'file-text', title: 'ch.psg2', detail: 'ch.psg2.d', prompt: 'ch.psg2.p' },
  { icon: 'list-checks', title: 'ch.psg3', detail: 'ch.psg3.d', prompt: 'ch.psg3.p' },
  { icon: 'square-pen', title: 'ch.psg4', detail: 'ch.psg4.d', prompt: 'ch.psg4.p' },
];

const SUGGESTIONS: Suggestion[] = [
  { icon: 'scale', title: 'ch.sg1', detail: 'ch.sg1.d', prompt: 'ch.sg1.p' },
  { icon: 'mail', title: 'ch.sg2', detail: 'ch.sg2.d', prompt: 'ch.sg2.p' },
  { icon: 'lightbulb', title: 'ch.sg3', detail: 'ch.sg3.d', prompt: 'ch.sg3.p' },
  { icon: 'terminal', title: 'ch.sg4', detail: 'ch.sg4.d', prompt: 'ch.sg4.p' },
];

/** All chats (ported from _proto/assistant.html): header with the scope picker, thread, usage strip and composer. */
@Component({
  selector: 'pc-chats-page',
  imports: [
    AvatarComponent,
    ButtonComponent,
    IconComponent,
    TooltipDirective,
    TranslatePipe,
    MarkdownComponent,
    ChatComposerComponent,
    ChatHistoryComponent,
    ChatMessageComponent,
    ChatScopePickerComponent,
    ChatUsageComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ac', '(document:keydown)': 'onKeydown($event)' },
  templateUrl: './chats-page.component.html',
})
export class ChatsPageComponent {
  private readonly chats = inject(ChatsService);
  private readonly scopes = inject(ChatScopesService);
  protected readonly session = this.chats.createSession();
  protected readonly i18n = inject(I18nService);
  private readonly settings = inject(AppSettingsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly routeId = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), { initialValue: null });
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly composer = viewChild(ChatComposerComponent);

  protected readonly historyOpen = signal(false);

  protected readonly chat = this.session.current;
  protected readonly messages = this.session.messages;
  protected readonly live = this.session.live;
  protected readonly agent = this.session.agent;
  protected readonly scope = this.session.scope;
  protected readonly scopeView = computed(() => this.scopes.describe(this.scope()));
  protected readonly suggestions = computed(() => (this.scope() === null ? SUGGESTIONS : PROJECT_SUGGESTIONS));
  protected readonly placeholder = computed(() =>
    this.scope() === null ? this.i18n.t('ch.ph') : this.i18n.t('ch.ph.project', { project: this.scopeView().name }),
  );
  protected readonly agentName = computed(() => AGENT_NAMES[this.agent()]);
  protected readonly model = computed(() => displayedModel(this.session, this.settings));
  protected readonly title = computed(() => this.chat()?.title || this.i18n.t('ch.untitled'));
  protected readonly empty = computed(() => this.messages().length === 0 && !this.live());
  protected readonly lastAssistantId = computed(() => lastOf(this.messages(), 'assistant')?.id ?? null);

  constructor() {
    void this.chats.load().catch((error: unknown) => this.fail('ch.err.load', error));
    effect(() => {
      const id = this.routeId();
      const loaded = this.chats.loaded();
      untracked(() => this.follow(id, loaded));
    });
    effect(() => {
      const current = this.session.currentId();
      untracked(() => this.syncRoute(current));
    });
    afterRenderEffect(() => {
      this.messages();
      this.live()?.text;
      this.scrollToEnd();
    });
  }

  protected newChat(): void {
    this.historyOpen.set(false);
    void this.router.navigate(['/chats', DRAFT_ROUTE_ID]);
    setTimeout(() => this.composer()?.focus());
  }

  protected openChat(id: string): void {
    this.historyOpen.set(false);
    void this.router.navigate(['/chats', id]);
  }

  protected fill(prompt: TranslationKey): void {
    this.composer()?.fill(this.i18n.t(prompt));
  }

  protected setAgent(agent: AgentId): void {
    this.session.setAgent(agent);
  }

  protected setScope(scope: ChatScope): void {
    this.session.setScope(scope);
  }

  protected setModel(model: string | null): void {
    this.session.setModel(model).catch((error: unknown) => this.fail('ch.err.model', error));
  }

  protected async send(text: string): Promise<void> {
    try {
      await this.session.send(text);
    } catch (error) {
      reportSendError(this.toast, this.i18n, error);
    }
  }

  protected retry(message: ChatMessage): void {
    const prompt = promptBefore(this.messages(), message);
    if (prompt) void this.send(prompt.text);
  }

  protected stop(): void {
    void this.session.stop();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      this.historyOpen.update((v) => !v);
    }
  }

  private follow(id: string | null, loaded: boolean): void {
    if (!loaded) return;
    if (id === null) {
      const recent = this.chats.chats()[0];
      void this.router.navigate(['/chats', recent?.id ?? DRAFT_ROUTE_ID], { replaceUrl: true });
      return;
    }
    if (id === DRAFT_ROUTE_ID) {
      this.session.startDraft();
      return;
    }
    if (!this.chats.chats().some((c) => c.id === id)) {
      void this.router.navigate(['/chats', DRAFT_ROUTE_ID], { replaceUrl: true });
      return;
    }
    this.session.open(id).catch((error: unknown) => this.fail('ch.err.load', error));
  }

  private syncRoute(current: string | null): void {
    const routeId = this.routeId();
    if (current && routeId === DRAFT_ROUTE_ID) {
      void this.router.navigate(['/chats', current], { replaceUrl: true });
    } else if (!current && routeId && routeId !== DRAFT_ROUTE_ID && this.chats.loaded()) {
      void this.router.navigate(['/chats', DRAFT_ROUTE_ID], { replaceUrl: true });
    }
  }

  private scrollToEnd(): void {
    scrollThreadToEnd(this.thread()?.nativeElement, !!this.live());
  }

  private fail(key: TranslationKey, error: unknown): void {
    reportChatError(this.toast, this.i18n, key, error);
  }
}
