import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';

import { AvatarComponent } from '@components/avatar/avatar.component';
import { StatusDotComponent } from '@components/badge/status-dot.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_NAMES } from '@features/agents/agents.service';
import { ChatScopesService } from '@features/chats/chat-scopes.service';
import type { ChatMessage, ChatScope, ScopeFilter } from '@features/chats/chats.model';
import { ChatsService } from '@features/chats/chats.service';
import type { AgentId } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { ChatComposerComponent, STATE_TONES } from '@pages/chats/chat-composer.component';
import { ChatHistoryComponent } from '@pages/chats/chat-history.component';
import { ChatMessageComponent } from '@pages/chats/chat-message.component';
import { ChatScopePickerComponent } from '@pages/chats/chat-scope-picker.component';
import { ChatUsageComponent } from '@pages/chats/chat-usage.component';
import { displayedModel, lastOf, promptBefore, reportChatError, reportSendError, scrollThreadToEnd } from '@pages/chats/chat-thread';
import { MarkdownComponent } from '@pages/chats/markdown.component';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { injectCurrentProjectId } from '../current-project';
import { LayoutService } from '../layout.service';
import { AssistantResizerComponent } from './assistant-resizer.component';
import { AssistantSessionService } from './assistant-session.service';

const GENERAL_SUGGESTIONS: TranslationKey[] = ['as.suggest.explain', 'as.suggest.email', 'as.suggest.script'];
const PROJECT_SUGGESTIONS: TranslationKey[] = ['as.suggest.summarize', 'as.suggest.stories', 'as.suggest.risks'];

/**
 * Assistant side panel: a chat that follows the project being viewed. Project chats run the CLI in
 * the project directory, where it can read and edit files; other chats have no project context.
 */
@Component({
  selector: 'pc-assistant-panel',
  imports: [
    AssistantResizerComponent,
    AvatarComponent,
    StatusDotComponent,
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
  host: { class: 'assistant', '[attr.aria-label]': "i18n.t('shell.assistant')", '[attr.aria-hidden]': '!layout.assistantOpen()' },
  templateUrl: './assistant-panel.component.html',
})
export class AssistantPanelComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly i18n = inject(I18nService);
  private readonly chats = inject(ChatsService);
  private readonly scopes = inject(ChatScopesService);
  private readonly connections = inject(AgentConnectionsService);
  private readonly settings = inject(AppSettingsService);
  private readonly toast = inject(ToastService);
  private readonly state = inject(AssistantSessionService);
  private readonly projectId = injectCurrentProjectId();
  private readonly list = viewChild<ElementRef<HTMLElement>>('messageList');
  private readonly composer = viewChild(ChatComposerComponent);

  protected readonly session = this.state.session;
  protected readonly historyOpen = signal(false);
  protected readonly messages = this.session.messages;
  protected readonly live = this.session.live;
  protected readonly agent = this.session.agent;
  protected readonly scope = this.session.scope;
  protected readonly agentName = computed(() => AGENT_NAMES[this.agent()]);
  protected readonly connection = computed(() => this.connections.state(this.agent()));
  protected readonly connectionTone = computed(() => STATE_TONES[this.connection()]);
  protected readonly connectionLabel = computed(() => `ch.cli.state.${this.connection()}` as TranslationKey);
  protected readonly model = computed(() => displayedModel(this.session, this.settings));
  protected readonly title = computed(() => this.session.current()?.title || this.i18n.t('ch.untitled'));
  protected readonly empty = computed(() => this.messages().length === 0 && !this.live());
  protected readonly lastAssistantId = computed(() => lastOf(this.messages(), 'assistant')?.id ?? null);
  protected readonly suggestions = computed(() => (this.scope() === null ? GENERAL_SUGGESTIONS : PROJECT_SUGGESTIONS));
  protected readonly historyFilter = computed<ScopeFilter>(() => ({ kind: 'scope', scope: this.scope() }));
  protected readonly placeholder = computed(() => {
    const scope = this.scope();
    return scope === null ? this.i18n.t('as.placeholder') : this.i18n.t('ch.ph.project', { project: this.scopes.describe(scope).name });
  });
  protected readonly footnote = computed<TranslationKey>(() => (this.scope() === null ? 'as.footnote' : 'as.footnote.project'));

  constructor() {
    void this.chats.load().catch((error: unknown) => reportChatError(this.toast, this.i18n, 'ch.err.load', error));
    effect(() => {
      const project = this.projectId();
      const loaded = this.chats.loaded();
      untracked(() => this.follow(project, loaded));
    });
    afterRenderEffect(() => {
      this.messages();
      this.live()?.text;
      scrollThreadToEnd(this.list()?.nativeElement, !!this.live());
    });
  }

  protected newChat(): void {
    this.historyOpen.set(false);
    this.session.startDraft();
    setTimeout(() => this.composer()?.focus());
  }

  protected openChat(id: string): void {
    this.historyOpen.set(false);
    this.session.open(id).catch((error: unknown) => reportChatError(this.toast, this.i18n, 'ch.err.load', error));
  }

  protected suggest(prompt: TranslationKey): void {
    this.composer()?.fill(this.i18n.t(prompt));
  }

  protected setAgent(agent: AgentId): void {
    this.session.setAgent(agent);
  }

  protected setScope(scope: ChatScope): void {
    this.session.setScope(scope);
  }

  protected setModel(model: string | null): void {
    this.session.setModel(model).catch((error: unknown) => reportChatError(this.toast, this.i18n, 'ch.err.model', error));
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

  private follow(project: string | null, loaded: boolean): void {
    if (!loaded || project === null || project === this.state.followedProject) return;
    this.state.followedProject = project;
    if (this.scope() === project || this.session.busy()) return;
    const latest = this.chats.latestIn(project);
    if (latest) this.openChat(latest.id);
    else this.session.startDraft(project);
  }
}
