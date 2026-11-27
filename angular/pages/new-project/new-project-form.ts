import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import type { Phase } from '@components/badge/phase-chip.component';
import { ToastService } from '@components/toast/toast.service';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { projectMonogram } from '@features/projects/project-phases';
import {
  DirectoryCheck,
  DocumentLanguage,
  NewProject,
  RepositoryInfo,
  SourceCandidate,
  SourceProblem,
} from '@features/projects/projects.model';
import { ProjectsService } from '@features/projects/projects.service';
import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { I18nService } from '@shared/i18n/i18n.service';

export const STEP_COUNT = 4;
const DIR_CHECK_DELAY_MS = 250;

const DIR_ERRORS: Record<Exclude<DirectoryCheck, 'available'>, TranslationKey> = {
  notAbsolute: 'np.dir.err.bad',
  notDirectory: 'np.dir.err.file',
  notEmpty: 'np.dir.err.notEmpty',
  unreadable: 'np.dir.err.unreadable',
};

const SOURCE_PROBLEMS: Record<SourceProblem, TranslationKey> = {
  notFound: 'np.file.p.notFound',
  notAFile: 'np.file.p.notAFile',
  tooLarge: 'np.file.p.tooLarge',
};

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function joinPath(parent: string, child: string): string {
  return child ? `${parent.replace(/[\\/]+$/, '')}\\${child}` : '';
}

function samePath(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** State and validation of the New project wizard. Provided by the page, shared by its steps. */
@Injectable()
export class NewProjectForm {
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(AppSettingsService);
  private readonly connections = inject(AgentConnectionsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly step = signal(0);
  readonly attempted = signal(false);

  readonly name = signal('');
  readonly code = signal('');
  readonly client = signal('');
  readonly industry = signal('');
  readonly description = signal('');
  readonly dir = signal('');
  /** Language of the generated documents; starts as the current UI language. */
  readonly documentLanguage = signal<DocumentLanguage>(this.i18n.lang());
  private readonly parentDir = signal('');
  private readonly codeEdited = signal(false);
  private readonly dirEdited = signal(false);
  private readonly checkedDir = signal<{ dir: string; check: DirectoryCheck } | null>(null);

  readonly phase = signal<Phase>('initial');

  readonly sources = signal<SourceCandidate[]>([]);
  readonly repository = signal('');
  readonly repoInfo = signal<RepositoryInfo | null>(null);
  readonly repoChecking = signal(false);

  readonly cli = signal<AgentId>('claude');
  readonly model = signal<string | null>(null);

  readonly monogram = computed(() => projectMonogram(this.name(), this.code()));

  readonly dirCheck = computed(() => {
    const checked = this.checkedDir();
    return checked && samePath(checked.dir, this.dir()) ? checked.check : null;
  });

  readonly nameError = computed<TranslationKey | null>(() => (this.name().trim() ? null : 'np.err.name'));

  readonly dirError = computed<TranslationKey | null>(() => {
    if (!this.dir().trim()) return 'np.dir.err.empty';
    const check = this.dirCheck();
    return check && check !== 'available' ? DIR_ERRORS[check] : null;
  });

  readonly repoRequired = computed(() => this.phase() === 'sdlc');

  readonly repoError = computed<TranslationKey | null>(() => {
    if (!this.repository().trim()) return this.repoRequired() ? 'np.repo.err' : null;
    const info = this.repoInfo();
    if (!info || info.status === 'ready') return null;
    return `np.repo.err.${info.status}` as TranslationKey;
  });

  readonly repoReady = computed(() => {
    const info = this.repoInfo();
    return !!info && info.status === 'ready' && samePath(info.path, this.repository());
  });

  readonly stepValid = computed(() => [
    !this.nameError() && this.dirCheck() === 'available',
    true,
    !this.repoError() && (!this.repository().trim() || this.repoReady()),
    true,
  ]);

  readonly connectedClis = computed(() => AGENT_IDS.filter((agent) => this.connections.connected(agent)));

  constructor() {
    void this.loadDefaults();
    this.watchDirectory();
  }

  setName(value: string): void {
    this.name.set(value);
    if (!this.codeEdited()) this.code.set(this.suggestCode(value));
    if (!this.dirEdited() && this.parentDir()) this.dir.set(joinPath(this.parentDir(), slugify(value)));
  }

  setCode(value: string): void {
    this.codeEdited.set(true);
    this.code.set(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  }

  setDir(value: string): void {
    this.dirEdited.set(true);
    this.dir.set(value);
  }

  async browseDir(): Promise<void> {
    const start = this.parentDir() || null;
    const picked = await this.settings.pickFolder(this.i18n.t('np.dir.pick'), start);
    if (picked) this.setDir(picked);
  }

  setPhase(phase: Phase): void {
    this.phase.set(phase);
  }

  async browseSources(): Promise<void> {
    this.addSources(await this.projects.pickSources(this.i18n.t('np.drop.pick')));
  }

  async dropSources(paths: string[]): Promise<void> {
    if (paths.length) this.addSources(await this.projects.describeSources(paths));
  }

  removeSource(path: string): void {
    this.sources.update((list) => list.filter((s) => s.path !== path));
  }

  setRepository(value: string): void {
    this.repository.set(value);
    this.repoInfo.set(null);
  }

  async browseRepository(): Promise<void> {
    const picked = await this.settings.pickFolder(this.i18n.t('np.repo.pick'), this.repository() || null);
    if (!picked) return;
    this.setRepository(picked);
    await this.inspectRepository();
  }

  async inspectRepository(): Promise<void> {
    const path = this.repository().trim();
    if (!path) return;
    this.repoChecking.set(true);
    try {
      const info = await this.projects.inspectRepo(path);
      if (samePath(path, this.repository())) this.repoInfo.set(info);
    } finally {
      this.repoChecking.set(false);
    }
  }

  setCli(agent: AgentId): void {
    this.cli.set(agent);
    this.model.set(this.settings.settings().agents[agent].model);
  }

  async next(): Promise<boolean> {
    await this.settlePendingChecks();
    if (!this.stepValid()[this.step()]) {
      this.attempted.set(true);
      return false;
    }
    this.attempted.set(false);
    this.step.update((s) => Math.min(s + 1, STEP_COUNT - 1));
    return true;
  }

  back(): void {
    this.attempted.set(false);
    this.step.update((s) => Math.max(s - 1, 0));
  }

  async allValid(): Promise<boolean> {
    await this.settlePendingChecks();
    const firstInvalid = this.stepValid().findIndex((valid) => !valid);
    if (firstInvalid < 0) return true;
    this.step.set(firstInvalid);
    this.attempted.set(true);
    return false;
  }

  toInput(): NewProject {
    const optional = (value: string) => value.trim() || null;
    return {
      name: this.name().trim(),
      code: optional(this.code()),
      client: optional(this.client()),
      industry: optional(this.industry()),
      description: optional(this.description()),
      dir: this.dir().trim(),
      phase: this.phase(),
      documentLanguage: this.documentLanguage(),
      repository: optional(this.repository()),
      sources: this.sources().map((s) => s.path),
      cli: this.cli(),
      model: this.model(),
    };
  }

  private async loadDefaults(): Promise<void> {
    await this.settings.load();
    const settings = this.settings.settings();
    this.setCli(this.preferredCli(settings.agents.defaultAgent));
    const parent = settings.general.defaultProjectDir?.trim() || (await this.projects.defaultDir().catch(() => ''));
    this.parentDir.set(parent);
    if (!this.dirEdited() && this.name()) this.dir.set(joinPath(parent, slugify(this.name())));
  }

  private preferredCli(preferred: AgentId): AgentId {
    if (this.connections.state(preferred) !== 'missing') return preferred;
    return this.connectedClis()[0] ?? preferred;
  }

  private suggestCode(name: string): string {
    return name.trim() ? projectMonogram(name, null) : '';
  }

  private addSources(candidates: SourceCandidate[]): void {
    const usable = candidates.filter((candidate) => !candidate.problem);
    for (const candidate of candidates.filter((c) => c.problem)) this.reportSkipped(candidate);
    this.sources.update((list) => [...list, ...usable.filter((c) => !list.some((s) => samePath(s.path, c.path)))]);
  }

  private reportSkipped(candidate: SourceCandidate): void {
    const reason = this.i18n.t(SOURCE_PROBLEMS[candidate.problem as SourceProblem]);
    this.toast.show(this.i18n.t('np.file.skipped', { name: candidate.name, reason }), { icon: 'triangle-alert', tone: 'warning' });
  }

  private watchDirectory(): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      const dir = this.dir().trim();
      clearTimeout(timer);
      if (!dir) return;
      timer = setTimeout(() => untracked(() => void this.checkDirectory(dir)), DIR_CHECK_DELAY_MS);
    });
  }

  private async settlePendingChecks(): Promise<void> {
    const dir = this.dir().trim();
    const pending: Promise<void>[] = [];
    if (dir && !this.dirCheck()) pending.push(this.checkDirectory(dir));
    if (this.repository().trim() && !this.repoInfo()) pending.push(this.inspectRepository());
    await Promise.all(pending);
  }

  private async checkDirectory(dir: string): Promise<void> {
    try {
      const check = await this.projects.checkDir(dir);
      this.checkedDir.set({ dir, check });
    } catch (error) {
      console.error('Could not check the project directory', error);
      this.checkedDir.set({ dir, check: 'unreadable' });
    }
  }
}
