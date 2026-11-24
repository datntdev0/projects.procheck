import { computed, signal } from '@angular/core';

import type { AgentConnectionsService } from '@features/agents/agent-connections.service';
import type { AgentId } from '@features/settings/app-settings.model';

import type { ChatScope } from './chats.model';
import type { ChatsService } from './chats.service';

/**
 * One conversation view: the chat it shows, or the draft (CLI, model and scope) of the chat the
 * next message will start. The CLI and the scope are fixed once the chat has started.
 */
export class ChatSession {
  private readonly draftCli = signal<AgentId | null>(null);
  private readonly draftModel = signal<string | null>(null);
  private readonly draftScope = signal<ChatScope>(null);

  private readonly openedId = signal<string | null>(null);

  readonly current = computed(() => this.chats.find(this.openedId()));
  readonly currentId = computed(() => this.current()?.id ?? null);
  readonly messages = computed(() => {
    const id = this.currentId();
    return id ? (this.chats.transcripts()[id] ?? []) : [];
  });
  readonly live = computed(() => {
    const id = this.currentId();
    return id ? (this.chats.liveTurns()[id] ?? null) : null;
  });
  readonly busy = computed(() => this.live() !== null);
  readonly agent = computed<AgentId>(() => this.current()?.agent ?? this.draftCli() ?? this.chats.preferredAgent());
  readonly selectedModel = computed(() => {
    const chat = this.current();
    return chat ? chat.selectedModel : this.draftModel();
  });
  readonly scope = computed<ChatScope>(() => {
    const chat = this.current();
    return chat ? chat.projectId : this.draftScope();
  });
  readonly locked = computed(() => this.current() !== null);

  constructor(
    private readonly chats: ChatsService,
    private readonly connections: AgentConnectionsService,
  ) {}

  async open(id: string | null): Promise<void> {
    this.openedId.set(id);
    if (id) await this.chats.loadMessages(id);
  }

  startDraft(scope: ChatScope = this.scope()): void {
    this.openedId.set(null);
    this.draftCli.set(null);
    this.draftModel.set(null);
    this.draftScope.set(scope);
  }

  setAgent(agent: AgentId): void {
    if (this.locked() || !this.connections.connected(agent) || agent === this.agent()) return;
    this.draftCli.set(agent);
    this.draftModel.set(null);
  }

  setScope(scope: ChatScope): void {
    if (!this.locked()) this.draftScope.set(scope);
  }

  async setModel(model: string | null): Promise<void> {
    const chat = this.current();
    if (chat) await this.chats.setModel(chat.id, model);
    else this.draftModel.set(model);
  }

  async send(text: string): Promise<string> {
    const id = this.currentId() ?? (await this.chats.create(this.agent(), this.draftModel(), this.draftScope())).id;
    this.openedId.set(id);
    await this.chats.send(id, text);
    return id;
  }

  stop(): Promise<boolean> {
    const id = this.currentId();
    return id ? this.chats.stop(id) : Promise.resolve(false);
  }
}
