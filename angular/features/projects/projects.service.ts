import { EnvironmentProviders, Injectable, computed, inject, provideAppInitializer, signal } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import {
  CreateProgress,
  DirectoryCheck,
  NewProject,
  ProjectItem,
  ProjectUpdate,
  RepositoryInfo,
  SourceCandidate,
} from './projects.model';

export type DropListener = (paths: string[]) => void;
export type DragOverListener = (over: boolean) => void;

/** Projects known to Procheck (`projects.json`) and the commands of the New project wizard. */
@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly ipc = inject(DesktopIpcService);

  private readonly items = signal<ProjectItem[]>([]);
  readonly projects = this.items.asReadonly();
  readonly loaded = signal(false);
  readonly ready = computed(() => this.items().filter((p) => p.status === 'ready'));

  find(id: string | null): ProjectItem | null {
    return this.items().find((p) => p.id === id) ?? null;
  }

  async load(): Promise<void> {
    try {
      this.items.set(await this.ipc.invoke<ProjectItem[]>('projects_list'));
    } finally {
      this.loaded.set(true);
    }
  }

  async open(id: string): Promise<ProjectItem> {
    const project = await this.ipc.invoke<ProjectItem>('projects_open', { id });
    this.upsert(project);
    return project;
  }

  async create(input: NewProject, onProgress: (step: CreateProgress) => void): Promise<ProjectItem> {
    const channel = new Channel<CreateProgress>();
    channel.onmessage = onProgress;
    const project = await this.ipc.invoke<ProjectItem>('projects_create', { input, onProgress: channel });
    this.upsert(project);
    return project;
  }

  async update(id: string, update: ProjectUpdate): Promise<ProjectItem> {
    const project = await this.ipc.invoke<ProjectItem>('projects_update', { id, update });
    this.replace(project);
    return project;
  }

  /** Removes the project from the list; its directory is kept. */
  async remove(id: string): Promise<void> {
    await this.ipc.invoke<void>('projects_remove', { id });
    this.forget(id);
  }

  /** Permanently deletes the project directory and removes the project from the list. */
  async delete(id: string): Promise<void> {
    await this.ipc.invoke<void>('projects_delete', { id });
    this.forget(id);
  }

  reveal(id: string): Promise<void> {
    return this.ipc.invoke<void>('projects_reveal', { id });
  }

  /** Opens the linked repository, or else the project directory, in VS Code. */
  openInVsCode(id: string): Promise<void> {
    return this.ipc.invoke<void>('projects_open_in_vscode', { id });
  }

  defaultDir(): Promise<string> {
    return this.ipc.invoke<string>('projects_default_dir');
  }

  checkDir(dir: string): Promise<DirectoryCheck> {
    return this.ipc.invoke<DirectoryCheck>('projects_check_dir', { dir });
  }

  pickSources(title: string): Promise<SourceCandidate[]> {
    return this.ipc.invoke<SourceCandidate[]>('projects_pick_sources', { title });
  }

  describeSources(paths: string[]): Promise<SourceCandidate[]> {
    return this.ipc.invoke<SourceCandidate[]>('projects_describe_sources', { paths });
  }

  inspectRepo(path: string): Promise<RepositoryInfo> {
    return this.ipc.invoke<RepositoryInfo>('projects_inspect_repo', { path });
  }

  /** Files dropped on the window. Resolves to an unsubscribe function (a no-op outside the desktop app). */
  async onFileDrop(onDrop: DropListener, onOver: DragOverListener): Promise<() => void> {
    try {
      return await getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'drop') {
          onOver(false);
          onDrop(payload.paths);
        } else {
          onOver(payload.type !== 'leave');
        }
      });
    } catch (error) {
      console.warn('File drop is only available in the desktop app', error);
      return () => undefined;
    }
  }

  private upsert(project: ProjectItem): void {
    this.items.update((list) => [project, ...list.filter((p) => p.id !== project.id)]);
  }

  private replace(project: ProjectItem): void {
    this.items.update((list) => list.map((p) => (p.id === project.id ? project : p)));
  }

  private forget(id: string): void {
    this.items.update((list) => list.filter((p) => p.id !== id));
  }
}

/** Reads the project list in the background; startup does not wait for it. */
export function provideProjects(): EnvironmentProviders {
  return provideAppInitializer(() => {
    void inject(ProjectsService)
      .load()
      .catch((error: unknown) => console.error('Could not load the project list', error));
  });
}
