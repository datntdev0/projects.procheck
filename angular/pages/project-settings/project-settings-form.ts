import { Injectable, computed, inject, signal } from '@angular/core';

import { ProjectManifest, ProjectUpdate, RepositoryInfo } from '@features/projects/projects.model';
import { ProjectsService } from '@features/projects/projects.service';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { injectCurrentProject } from '@layout/current-project';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';

/** General section of Project settings; empty strings = not set. */
export interface ProjectGeneralForm {
  name: string;
  client: string;
  code: string;
  description: string;
  repository: string;
}

interface Draft {
  projectId: string;
  value: ProjectGeneralForm;
}

export type ProjectSaveResult = { ok: true } | { ok: false; code: string | null; message: string };

const EMPTY_FORM: ProjectGeneralForm = { name: '', client: '', code: '', description: '', repository: '' };

function toForm(manifest: ProjectManifest): ProjectGeneralForm {
  return {
    name: manifest.name,
    client: manifest.client ?? '',
    code: manifest.code ?? '',
    description: manifest.description ?? '',
    repository: manifest.repository ?? '',
  };
}

function optional(value: string): string | null {
  return value.trim() || null;
}

function toUpdate(form: ProjectGeneralForm): ProjectUpdate {
  return {
    name: form.name.trim(),
    code: optional(form.code.toUpperCase()),
    client: optional(form.client),
    description: optional(form.description),
    repository: optional(form.repository),
  };
}

function sameForm(a: ProjectGeneralForm, b: ProjectGeneralForm): boolean {
  return (Object.keys(a) as (keyof ProjectGeneralForm)[]).every((key) => a[key] === b[key]);
}

/** Edits of the General section, saved to `procheck.json` through the save bar. Provided by the page. */
@Injectable()
export class ProjectSettingsForm {
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(AppSettingsService);
  private readonly i18n = inject(I18nService);
  private readonly draft = signal<Draft | null>(null);

  readonly project = injectCurrentProject();
  readonly saving = signal(false);
  readonly repoChecking = signal(false);
  /** Result of inspecting the repository picked in this session (not yet saved). */
  readonly repoInfo = signal<RepositoryInfo | null>(null);

  private readonly baseline = computed(() => {
    const manifest = this.project()?.manifest;
    return manifest ? toForm(manifest) : EMPTY_FORM;
  });

  readonly value = computed(() => {
    const draft = this.draft();
    return draft && draft.projectId === this.project()?.id ? draft.value : this.baseline();
  });
  readonly dirty = computed(() => !sameForm(this.value(), this.baseline()));
  readonly nameMissing = computed(() => !this.value().name.trim());
  readonly repoRequired = computed(() => this.project()?.manifest.phase === 'sdlc');

  patch(changes: Partial<ProjectGeneralForm>): void {
    const id = this.project()?.id;
    if (id) this.draft.set({ projectId: id, value: { ...this.value(), ...changes } });
  }

  /** Picks a folder and links it when it is a git work tree; returns what was found (null when cancelled). */
  async browseRepository(): Promise<RepositoryInfo | null> {
    const current = this.value().repository.trim();
    const picked = await this.settings.pickFolder(this.i18n.t('np.repo.pick'), current || null);
    if (!picked) return null;
    this.repoChecking.set(true);
    try {
      const info = await this.projects.inspectRepo(picked);
      if (info.status === 'ready') {
        this.patch({ repository: info.root ?? info.path });
        this.repoInfo.set(info);
      }
      return info;
    } finally {
      this.repoChecking.set(false);
    }
  }

  unlinkRepository(): void {
    this.patch({ repository: '' });
    this.repoInfo.set(null);
  }

  discard(): void {
    this.draft.set(null);
    this.repoInfo.set(null);
  }

  async save(): Promise<ProjectSaveResult> {
    const id = this.project()?.id;
    if (!id) return { ok: false, code: 'notFound', message: '' };
    this.saving.set(true);
    try {
      await this.projects.update(id, toUpdate(this.value()));
      this.discard();
      return { ok: true };
    } catch (error) {
      const failure = error instanceof DesktopIpcError ? error : null;
      return { ok: false, code: failure?.code ?? null, message: failure?.reason ?? String(error) };
    } finally {
      this.saving.set(false);
    }
  }
}
