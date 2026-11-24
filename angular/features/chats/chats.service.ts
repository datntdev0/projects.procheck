import { Injectable, inject, signal } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';

import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { ChatSession } from './chat-session';
import type { ChatEvent, ChatMessage, ChatScope, ChatSummary, ChatsOverview, LiveTurn, TurnResult, UsageLimits } from './chats.model';

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
 * Every chat (general and project chats), their transcripts and the turns being streamed. Lives at
 * the app root, so a turn keeps streaming while the user is on another page. Each view that shows a
 * conversation (All chats page, Assistant panel) opens its own {@link ChatSession}.
 */
@Injectable({ providedIn: 'root' })
export class ChatsService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly settings = inject(AppSettingsService);
  private readonly connections = inject(AgentConnectionsService);

  private readonly chatList = signal<ChatSummary[]>([]);
  private readonly transcriptMap = signal<Record<string, ChatMessage[]>>({});
  private readonly liveMap = signal<Record<string, LiveTurn>>({});
  private readonly limitList = signal<UsageLimits[]>([]);
  private loading: Promise<void> | null = null;

  readonly chats = this.chatList.asReadonly();
  readonly transcripts = this.transcriptMap.asReadonly();
  readonly liveTurns = this.liveMap.asReadonly();
  readonly limits = this.limitList.asReadonly();
  readonly paths = signal<ChatPaths | null>(null);
  readonly loaded = signal(false);

  createSession(): ChatSession {
    return new ChatSession(this, this.connections);
  }

  load(): Promise<void> {
    this.loading ??= this.fetchOverview();
    return this.loading;
  }

  async reload(): Promise<void> {
    this.loading = this.fetchOverview();
    return this.loading;
  }

  find(id: string | null): ChatSummary | null {
    return this.chatList().find((c) => c.id === id) ?? null;
  }

  latestIn(scope: ChatScope): ChatSummary | null {
    return this.chatList().find((c) => c.projectId === scope) ?? null;
  }

  async loadMessages(id: string): Promise<void> {
    if (this.transcriptMap()[id] || this.liveMap()[id]) return;
    const messages = await this.ipc.invoke<ChatMessage[]>('chats_messages', { id });
    this.transcriptMap.update((all) => ({ ...all, [id]: messages }));
  }

  preferredAgent(): AgentId {
    const preferred = this.settings.settings().agents.defaultAgent;
    const state = this.connections.state(preferred);
    if (state === 'checking' || state === 'connected') return preferred;
    return AGENT_IDS.find((agent) => this.connections.connected(agent)) ?? preferred;
  }

  limitsOf(agent: AgentId): UsageLimits | null {
    return this.limitList().find((l) => l.agent === agent) ?? null;
  }

  async create(agent: AgentId, model: string | null, projectId: ChatScope): Promise<ChatSummary> {
    const chat = await this.ipc.invoke<ChatSummary>('chats_create', { agent, model, projectId });
    this.chatList.update((list) => upsert(list, chat));
    this.transcriptMap.update((all) => ({ ...all, [chat.id]: [] }));
    return chat;
  }

  async setModel(id: string, model: string | null): Promise<void> {
    this.replace(await this.ipc.invoke<ChatSummary>('chats_set_model', { id, model }));
  }

  async send(id: string, text: string): Promise<void> {
    this.liveMap.update((all) => ({ ...all, [id]: { text: '', model: null } }));
    const channel = new Channel<ChatEvent>();
    channel.onmessage = (event) => this.onEvent(id, event);
    try {
      const result = await this.ipc.invoke<TurnResult>('chats_send', { id, text, onEvent: channel });
      this.finish(id, result);
    } finally {
      this.liveMap.update((all) => withoutKey(all, id));
    }
  }

  stop(id: string): Promise<boolean> {
    return this.ipc.invoke<boolean>('chats_stop', { id });
  }

  async rename(id: string, title: string): Promise<void> {
    this.replace(await this.ipc.invoke<ChatSummary>('chats_rename', { id, title }));
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    this.replace(await this.ipc.invoke<ChatSummary>('chats_pin', { id, pinned }));
  }

  async remove(id: string): Promise<void> {
    await this.ipc.invoke<void>('chats_delete', { id });
    this.chatList.update((list) => list.filter((c) => c.id !== id));
    this.transcriptMap.update((all) => withoutKey(all, id));
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

  private onEvent(id: string, event: ChatEvent): void {
    if (event.type === 'userMessage') {
      this.replace(event.chat);
      this.appendMessage(id, event.message);
    } else if (event.type === 'started') {
      this.liveMap.update((all) => ({ ...all, [id]: { text: all[id]?.text ?? '', model: event.model } }));
    } else {
      this.liveMap.update((all) => ({ ...all, [id]: { model: all[id]?.model ?? null, text: (all[id]?.text ?? '') + event.text } }));
    }
  }

  private finish(id: string, result: TurnResult): void {
    this.appendMessage(id, result.message);
    this.replace(result.chat);
    this.limitList.set(result.limits);
    if (RECHECK_ON.includes(result.message.error?.code ?? '')) void this.connections.check(result.chat.agent);
  }

  private appendMessage(id: string, message: ChatMessage): void {
    this.transcriptMap.update((all) => ({ ...all, [id]: [...(all[id] ?? []), message] }));
  }

  private replace(chat: ChatSummary): void {
    this.chatList.update((list) => upsert(list, chat));
  }
}
