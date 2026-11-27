import { Injectable, inject } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { ArtifactContent, ArtifactFile, ArtifactsOverview, GenerateEvent, GenerateResult, ReviewStatus } from './artifacts.model';

/** Artifacts of a project (`artifacts\`, git history, review status) and the AI generation of a step. */
@Injectable({ providedIn: 'root' })
export class ArtifactsService {
  private readonly ipc = inject(DesktopIpcService);

  overview(id: string): Promise<ArtifactsOverview> {
    return this.ipc.invoke<ArtifactsOverview>('artifacts_overview', { id });
  }

  read(id: string, path: string): Promise<ArtifactContent> {
    return this.ipc.invoke<ArtifactContent>('artifacts_read', { id, path });
  }

  /** Runs the project's CLI as an agent for a step. Resolves when the run ends (also when it was stopped or failed). */
  generate(id: string, stepId: string, onEvent: (event: GenerateEvent) => void): Promise<GenerateResult> {
    const channel = new Channel<GenerateEvent>();
    channel.onmessage = onEvent;
    return this.ipc.invoke<GenerateResult>('artifacts_generate', { id, stepId, onEvent: channel });
  }

  /** Stops the run of the project; `false` when none is running. */
  stop(id: string): Promise<boolean> {
    return this.ipc.invoke<boolean>('artifacts_generate_stop', { id });
  }

  setStatus(id: string, path: string, status: ReviewStatus): Promise<ArtifactFile> {
    return this.ipc.invoke<ArtifactFile>('artifacts_set_status', { id, path, status });
  }

  openInVsCode(id: string, path: string): Promise<void> {
    return this.ipc.invoke<void>('artifacts_open_in_vscode', { id, path });
  }

  reveal(id: string, path: string): Promise<void> {
    return this.ipc.invoke<void>('artifacts_reveal', { id, path });
  }
}
