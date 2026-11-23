import { Injectable } from '@angular/core';
import { InvokeArgs, invoke } from '@tauri-apps/api/core';

import { DesktopIpcError } from './desktop-ipc-error';

export interface AppInfo {
  name: string;
  version: string;
}

/** Thin wrapper around Tauri `invoke()` that normalises failures into `DesktopIpcError`. */
@Injectable({ providedIn: 'root' })
export class DesktopIpcService {
  async invoke<T>(command: string, args?: InvokeArgs): Promise<T> {
    try {
      return await invoke<T>(command, args);
    } catch (cause) {
      throw new DesktopIpcError(command, cause);
    }
  }

  appInfo(): Promise<AppInfo> {
    return this.invoke<AppInfo>('app_info');
  }
}
