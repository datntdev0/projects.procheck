import { Injectable, computed, inject, signal } from '@angular/core';

import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';

import { ToolId, ToolItem, ToolProgress, ToolProgressView, ToolsEvent, ToolsSnapshot, isWorking } from './tools.model';
import { ToolsService } from './tools.service';

/**
 * State of the bundled tools, shared by the splash screen and Settings → Agent integration: the last snapshot,
 * live download numbers per tool, and the install that is running (one at a time).
 */
@Injectable({ providedIn: 'root' })
export class ToolsStore {
  private readonly service = inject(ToolsService);
  private readonly connections = inject(AgentConnectionsService);

  readonly snapshot = signal<ToolsSnapshot | null>(null);
  /** The first check finished (or failed). */
  readonly checked = signal(false);
  readonly checking = signal(false);
  /** The check itself failed (not an install): code and message. */
  readonly checkError = signal<{ code: string | null; message: string } | null>(null);
  readonly installing = signal(false);
  readonly progress = signal<Partial<Record<ToolId, ToolProgress>>>({});

  /** Git has been seen ready once in this app run; from then on navigation is free. */
  readonly gitReadySeen = signal(false);

  readonly items = computed(() => this.snapshot()?.items ?? []);
  readonly gitReady = computed(() => this.snapshot()?.gitReady ?? false);
  readonly dataDir = computed(() => this.snapshot()?.dataDir ?? '');

  item(id: ToolId): ToolItem | null {
    return this.items().find((i) => i.id === id) ?? null;
  }

  /** Live numbers of a tool that is being installed; `null` otherwise. Only a download has a measurable percentage. */
  view(id: ToolId): ToolProgressView | null {
    const item = this.item(id);
    if (!item || !isWorking(item.state)) return null;
    const live = this.progress()[id];
    const total = live?.total || item.size;
    const received = live?.received ?? item.received;
    const determinate = item.state === 'downloading';
    const percent = determinate && total ? Math.min(100, Math.floor((received / total) * 100)) : item.state === 'pending' ? 0 : determinate ? 0 : 100;
    return { state: item.state, percent, received, total, speed: live?.speed ?? 0, determinate };
  }

  /** Reads the state of the tools from disk (no download). */
  async check(): Promise<void> {
    this.checking.set(true);
    this.checkError.set(null);
    try {
      this.setSnapshot(await this.service.check());
    } catch (error) {
      console.error('Could not check the tools', error);
      this.checkError.set(describe(error));
    } finally {
      this.checking.set(false);
      this.checked.set(true);
    }
  }

  /** Installs the tools in order, reporting progress; resolves when the run ended. */
  async install(ids: ToolId[]): Promise<void> {
    if (this.installing()) return;
    this.installing.set(true);
    this.progress.set({});
    this.checkError.set(null);
    try {
      const snapshot = await this.service.install(ids, (event) => this.onEvent(event));
      this.setSnapshot(snapshot);
      for (const id of ids) if (id !== 'git' && this.item(id)?.state === 'ready') void this.connections.check(id);
    } catch (error) {
      console.error('Could not install the tools', error);
      const busy = error instanceof DesktopIpcError && error.code === 'busy';
      await this.check();
      if (!busy) this.checkError.set(describe(error));
    } finally {
      this.installing.set(false);
      this.progress.set({});
    }
  }

  async cancel(): Promise<void> {
    try {
      await this.service.cancel();
    } catch (error) {
      console.error('Could not cancel the install', error);
    }
  }

  private onEvent(event: ToolsEvent): void {
    if (event.type === 'item') {
      this.snapshot.update((s) => (s ? { ...s, items: s.items.map((i) => (i.id === event.item.id ? event.item : i)) } : s));
      if (!isWorking(event.item.state)) this.progress.update(({ [event.item.id]: _done, ...rest }) => rest);
    } else {
      this.progress.update((all) => ({ ...all, [event.id]: { received: event.received, total: event.total, speed: event.speed } }));
    }
  }

  private setSnapshot(snapshot: ToolsSnapshot): void {
    this.snapshot.set(snapshot);
    if (snapshot.gitReady) this.gitReadySeen.set(true);
  }
}

function describe(error: unknown): { code: string | null; message: string } {
  return error instanceof DesktopIpcError ? { code: error.code, message: error.reason } : { code: null, message: String(error) };
}
