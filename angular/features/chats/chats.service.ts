import { Injectable, computed, inject, signal } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';

import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import type { ChatEvent, ChatMessage, ChatSummary, ChatsOverview, LiveTurn, TurnResult, UsageLimits } from './chats.model';

interface ChatPaths {
  chatsDir: string;
  workingDir: string;
  cliDir: string;
}

const RECHECK_ON: string[] = ['signedOut', 'notInstalled'];

function upsert(list: ChatSummary[], chat: ChatSummary): ChatSummary[] {
  const rest = list.filter((c) => c.id !== chat.id);
  return [chat, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

/**
 * General chats (no project) shown on the All chats page. Lives at the app root, so a turn
 * keeps streaming while the user is on another page.
 */
@Injectable({ providedIn: 'root' })
export class ChatsService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly settings = inject(AppSettingsService);
  private readonly connections = inject(AgentConnectionsService);

  private readonly chatList = signal<ChatSummary[]>([]);
  private readonly transcripts = signal<Record<string, ChatMessage[]>>({});
  private readonly liveTurns = signal<Record<string, LiveTurn>>({});
  private readonly limitList = signal<UsageLimits[]>([]);
  private readonly draftCli = signal<AgentId | null>(null);
  private readonly draftModel = signal<string | null>(null);
  private loading: Promise<void> | null = null;

  readonly chats = this.chatList.asReadonly();
  readonly limits = this.limitList.asReadonly();
  readonly paths = signal<ChatPaths | null>(null);
  readonly loaded = signal(false);
  readonly currentId = signal<string | null>(null);

  readonly current = computed(() => this.chatList().find((c) => c.id === this.currentId()) ?? null);
  readonly messages = computed(() => {
    const id = this.currentId();
    return id ? (this.transcripts()[id] ?? []) : [];
  });
  readonly live = computed(() => {
    const id = this.currentId();
    return id ? (this.liveTurns()[id] ?? null) : null;
  });
  readonly busy = computed(() => this.live() !== null);
  readonly agent = computed<AgentId>(() => this.current()?.agent ?? this.draftCli() ?? this.preferredAgent());
  readonly selectedModel = computed(() => {
    const chat = this.current();
    return chat ? chat.selectedModel : this.draftModel();
  });
  readonly agentLocked = computed(() => this.current() !== null);

  load(): Promise<void> {
    this.loading ??= this.fetchOverview();
    return this.loading;
  }

  async reload(): Promise<void> {
    this.loading = this.fetchOverview();
    return this.loading;
  }

  async open(id: string | null): Promise<void> {
    this.currentId.set(id);
    if (!id || this.transcripts()[id] || this.liveTurns()[id]) return;
    const messages = await this.ipc.invoke<ChatMessage[]>('chats_messages', { id });
    this.transcripts.update((all) => ({ ...all, [id]: messages }));
  }

  startDraft(): void {
    this.currentId.set(null);
    this.draftCli.set(null);
    this.draftModel.set(null);
  }

  setAgent(agent: AgentId): void {
    if (this.agentLocked() || !this.connections.connected(agent) || agent === this.agent()) return;
    this.draftCli.set(agent);
    this.draftModel.set(null);
  }

  async setModel(model: string | null): Promise<void> {
    const chat = this.current();
    if (!chat) {
      this.draftModel.set(model);
      return;
    }
    this.replace(await this.ipc.invoke<ChatSummary>('chats_set_model', { id: chat.id, model }));
  }

  limitsOf(agent: AgentId): UsageLimits | null {
    return this.limitList().find((l) => l.agent === agent) ?? null;
  }

  async send(text: string): Promise<string> {
    const id = this.currentId() ?? (await this.create(this.agent(), this.draftModel())).id;
    this.currentId.set(id);
    this.liveTurns.update((all) => ({ ...all, [id]: { text: '', model: null } }));
    const channel = new Channel<ChatEvent>();
    channel.onmessage = (event) => this.onEvent(id, event);
    try {
      const result = await this.ipc.invoke<TurnResult>('chats_send', { id, text, onEvent: channel });
      this.finish(id, result);
    } finally {
      this.liveTurns.update((all) => withoutKey(all, id));
    }
    return id;
  }

  stop(): Promise<boolean> {
    const id = this.currentId();
    return id ? this.ipc.invoke<boolean>('chats_stop', { id }) : Promise.resolve(false);
  }

  async rename(id: string, title: string): Promise<void> {
    const chat = await this.ipc.invoke<ChatSummary>('chats_rename', { id, title });
    this.replace(chat);
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const chat = await this.ipc.invoke<ChatSummary>('chats_pin', { id, pinned });
    this.replace(chat);
  }

  async remove(id: string): Promise<void> {
    await this.ipc.invoke<void>('chats_delete', { id });
    this.chatList.update((list) => list.filter((c) => c.id !== id));
    this.transcripts.update((all) => withoutKey(all, id));
    if (this.currentId() === id) this.currentId.set(null);
  }

  private async fetchOverview(): Promise<void> {
    try {
      const overview = await this.ipc.invoke<ChatsOverview>('chats_overview');
      this.chatList.set(overview.chats);
      this.limitList.set(overview.limits);
      this.paths.set({ chatsDir: overview.chatsDir, workingDir: overview.workingDir, cliDir: overview.cliDir });
    } finally {
      this.loaded.set(true);
    }
  }

  private preferredAgent(): AgentId {
    const preferred = this.settings.settings().agents.defaultAgent;
    const state = this.connections.state(preferred);
    if (state === 'checking' || state === 'connected') return preferred;
    return AGENT_IDS.find((agent) => this.connections.connected(agent)) ?? preferred;
  }

  private async create(agent: AgentId, model: string | null): Promise<ChatSummary> {
    const chat = await this.ipc.invoke<ChatSummary>('chats_create', { agent, model });
    this.chatList.update((list) => upsert(list, chat));
    this.transcripts.update((all) => ({ ...all, [chat.id]: [] }));
    return chat;
  }

  private onEvent(id: string, event: ChatEvent): void {
    if (event.type === 'userMessage') {
      this.replace(event.chat);
      this.appendMessage(id, event.message);
    } else if (event.type === 'started') {
      this.liveTurns.update((all) => ({ ...all, [id]: { text: all[id]?.text ?? '', model: event.model } }));
    } else {
      this.liveTurns.update((all) => ({ ...all, [id]: { model: all[id]?.model ?? null, text: (all[id]?.text ?? '') + event.text } }));
    }
  }

  private finish(id: string, result: TurnResult): void {
    this.appendMessage(id, result.message);
    this.replace(result.chat);
    this.limitList.set(result.limits);
    if (RECHECK_ON.includes(result.message.error?.code ?? '')) void this.connections.check(result.chat.agent);
  }

  private appendMessage(id: string, message: ChatMessage): void {
    this.transcripts.update((all) => ({ ...all, [id]: [...(all[id] ?? []), message] }));
  }

  private replace(chat: ChatSummary): void {
    this.chatList.update((list) => upsert(list, chat));
  }
}
