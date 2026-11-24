import { Injectable, inject } from '@angular/core';

import { ToastService } from '@components/toast/toast.service';
import { ProjectsService } from '@features/projects/projects.service';
import { I18nService } from '@shared/i18n/i18n.service';

/** Path actions shared by the project pages (copy, reveal in Explorer, open in VS Code), with their toasts. */
@Injectable({ providedIn: 'root' })
export class ProjectActionsService {
  private readonly projects = inject(ProjectsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  async copyPath(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      this.toast.show(this.i18n.t('proj.copied'), { icon: 'copy' });
    } catch {
      this.toast.show(this.i18n.t('proj.copy.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  async reveal(id: string): Promise<void> {
    try {
      await this.projects.reveal(id);
    } catch {
      this.toast.show(this.i18n.t('proj.reveal.failed'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  async openInVsCode(id: string, folder: string): Promise<void> {
    try {
      await this.projects.openInVsCode(id);
      this.toast.show(this.i18n.t('ws.vscode.toast', { path: folder }), { icon: 'code-xml' });
    } catch {
      this.toast.show(this.i18n.t('ws.vscode.failed'), { icon: 'circle-alert', tone: 'danger', duration: 6000 });
    }
  }
}
