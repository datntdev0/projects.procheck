import { Injectable, inject } from '@angular/core';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

/** Known entries of the application data directory (mirrors `StorageEntry` in desktop/src/features/storage.rs). */
export type StorageEntry = 'settings' | 'projects' | 'logs' | 'cli' | 'cache';

export interface StorageItem {
  entry: StorageEntry;
  /** Name relative to the data directory, e.g. `settings.json` or `logs\`. */
  name: string;
  path: string;
  isDirectory: boolean;
  exists: boolean;
  bytes: number;
}

export interface StorageOverview {
  root: string;
  totalBytes: number;
  items: StorageItem[];
}

/** Application data directory (`%LOCALAPPDATA%\Procheck`) — read-only view and "open in Explorer". */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly ipc = inject(DesktopIpcService);

  overview(): Promise<StorageOverview> {
    return this.ipc.invoke<StorageOverview>('storage_overview');
  }

  /** Opens the data directory, or one of its entries, in the OS file manager. */
  open(entry?: StorageEntry): Promise<void> {
    return this.ipc.invoke<void>('storage_open', { entry: entry ?? null });
  }
}
