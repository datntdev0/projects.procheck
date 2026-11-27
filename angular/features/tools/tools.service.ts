import { Injectable, inject } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { ToolId, ToolsEvent, ToolsSnapshot } from './tools.model';

/** Git, Claude Code and Codex bundled with Procheck, kept in `<data dir>\tools\`. */
@Injectable({ providedIn: 'root' })
export class ToolsService {
  private readonly ipc = inject(DesktopIpcService);

  check(): Promise<ToolsSnapshot> {
    return this.ipc.invoke<ToolsSnapshot>('tools_check');
  }

  /**
   * Downloads and installs the tools one after another. Resolves when all are done; a failure of one tool is in its
   * item, not a rejection. Rejects with code `busy` when an install is already running.
   */
  install(ids: ToolId[], onEvent: (event: ToolsEvent) => void): Promise<ToolsSnapshot> {
    const channel = new Channel<ToolsEvent>();
    channel.onmessage = onEvent;
    return this.ipc.invoke<ToolsSnapshot>('tools_install', { ids, onEvent: channel });
  }

  /** Cancels the running install; `false` when none is running. */
  cancel(): Promise<boolean> {
    return this.ipc.invoke<boolean>('tools_cancel');
  }
}
