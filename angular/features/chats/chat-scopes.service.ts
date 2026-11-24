import { Injectable, computed, inject } from '@angular/core';

import { projectMonogram } from '@features/projects/project-phases';
import type { ReadyProjectItem } from '@features/projects/projects.model';
import { ProjectsService } from '@features/projects/projects.service';
import { I18nService } from '@shared/i18n/i18n.service';

import type { ChatScope } from './chats.model';

/** A chat scope as shown to the user: the project (name, monogram, directory) or no project. */
export interface ScopeView {
  scope: ChatScope;
  name: string;
  monogram: string | null;
  dir: string | null;
  available: boolean;
}

function projectView(project: ReadyProjectItem): ScopeView {
  const { name, code } = project.manifest;
  return { scope: project.id, name, monogram: projectMonogram(name, code), dir: project.dir, available: true };
}

/** Resolves chat scopes against the known projects. */
@Injectable({ providedIn: 'root' })
export class ChatScopesService {
  private readonly projects = inject(ProjectsService);
  private readonly i18n = inject(I18nService);

  readonly projectScopes = computed<ScopeView[]>(() =>
    this.projects
      .projects()
      .filter((p): p is ReadyProjectItem => p.manifest !== null && p.status === 'ready')
      .map(projectView),
  );

  describe(scope: ChatScope): ScopeView {
    if (scope === null) return { scope, name: this.i18n.t('ch.scope.none'), monogram: null, dir: null, available: true };
    const known = this.projectScopes().find((s) => s.scope === scope);
    return known ?? { scope, name: this.i18n.t('ch.scope.gone'), monogram: '?', dir: null, available: false };
  }
}
