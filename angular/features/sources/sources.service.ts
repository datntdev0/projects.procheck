import { Injectable, inject } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { ImportItem, ImportProgress, SourceCandidate, SourceCategory, SourceList, SourceRecord } from './sources.model';

/** Commands of the Sources page: the files in a project's `sources\` folder and their catalog. */
@Injectable({ providedIn: 'root' })
export class SourcesService {
  private readonly ipc = inject(DesktopIpcService);

  /** The catalog, after picking up files changed in the folder outside Procheck. */
  list(projectId: string): Promise<SourceList> {
    return this.ipc.invoke<SourceList>('sources_list', { id: projectId });
  }

  /** Native picker for files, or folders when `folders` is set; empty when cancelled. */
  pick(projectId: string, folders: boolean, title: string): Promise<SourceCandidate[]> {
    return this.ipc.invoke<SourceCandidate[]>('sources_pick', { id: projectId, folders, title });
  }

  /** Dropped files and folders, expanded and checked for duplicates. */
  inspect(projectId: string, paths: string[]): Promise<SourceCandidate[]> {
    return this.ipc.invoke<SourceCandidate[]>('sources_inspect', { id: projectId, paths });
  }

  import(projectId: string, items: ImportItem[], onProgress: (step: ImportProgress) => void): Promise<SourceRecord[]> {
    const channel = new Channel<ImportProgress>();
    channel.onmessage = onProgress;
    return this.ipc.invoke<SourceRecord[]>('sources_import', { id: projectId, items, onProgress: channel });
  }

  remove(projectId: string, ids: string[]): Promise<SourceRecord[]> {
    return this.ipc.invoke<SourceRecord[]>('sources_remove', { id: projectId, ids });
  }

  setCategory(projectId: string, sourceId: string, category: SourceCategory): Promise<SourceRecord> {
    return this.ipc.invoke<SourceRecord>('sources_set_category', { id: projectId, sourceId, category });
  }

  open(projectId: string, sourceId: string): Promise<void> {
    return this.ipc.invoke<void>('sources_open', { id: projectId, sourceId });
  }

  /** Shows the file in File Explorer, or opens the `sources\` folder without a file. */
  reveal(projectId: string, sourceId: string | null): Promise<void> {
    return this.ipc.invoke<void>('sources_reveal', { id: projectId, sourceId });
  }
}
