import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { AlertComponent } from '@components/alert/alert.component';
import { BadgeComponent, BadgeTone } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { InputDirective } from '@components/form/input.directive';
import { SegmentedComponent, SegmentedOption } from '@components/form/segmented.component';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { AGENT_NAMES } from '@features/agents/agents.service';
import { ArtifactFile, REVIEW_STATUSES, ReviewStatus, artifactFileName } from '@features/projects/artifacts.model';
import { ArtifactsService } from '@features/projects/artifacts.service';
import { ArtifactsStore } from '@features/projects/artifacts.store';
import { ProjectsService } from '@features/projects/projects.service';
import { injectCurrentProject, injectCurrentProjectId } from '@layout/current-project';
import { formatDate } from '@shared/format/date';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { MarkdownComponent } from '../chats/markdown.component';
import { ProjectGateComponent } from '../project/project-gate.component';

interface TreeArtifact {
  id: string;
  name: string;
  files: ArtifactFile[];
}

interface TreeStep {
  stepId: string;
  artifacts: TreeArtifact[];
}

const STATUS_TONE: Record<ReviewStatus, BadgeTone> = { draft: 'neutral', review: 'warning', approved: 'success' };

/**
 * Artifacts (ported from _proto/artifacts.html): the files the Assistant wrote to `artifacts\initial\`, grouped by
 * step and artifact, with a Markdown viewer and the review status. Selection lives in the URL (`?path=` or `?artifact=`).
 */
@Component({
  selector: 'pc-artifacts-page',
  imports: [
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    InputDirective,
    MarkdownComponent,
    ProjectGateComponent,
    RouterLink,
    SegmentedComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:focus)': 'onWindowFocus()' },
  templateUrl: './artifacts-page.component.html',
})
export class ArtifactsPageComponent {
  protected readonly store = inject(ArtifactsStore);
  private readonly service = inject(ArtifactsService);
  private readonly projects = inject(ProjectsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly projectId = injectCurrentProjectId();
  protected readonly project = injectCurrentProject();

  protected readonly query = signal('');
  protected readonly content = signal<{ path: string; text: string } | null>(null);
  protected readonly reading = signal(false);
  protected readonly readFailed = signal(false);

  private readonly pathParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('path'))), { initialValue: null });
  private readonly artifactParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('artifact'))), { initialValue: null });

  protected readonly overview = computed(() => this.store.overview(this.projectId()));
  protected readonly loaded = computed(() => this.store.loaded(this.projectId()));

  private readonly steps = computed(() => this.overview()?.steps ?? []);
  private readonly orphans = computed(() => this.overview()?.orphans ?? []);
  private readonly allFiles = computed(() => [...this.steps().flatMap((s) => s.artifacts.flatMap((a) => a.files)), ...this.orphans()]);

  protected readonly hasCustomization = computed(() => this.steps().length > 0);
  protected readonly hasFiles = computed(() => this.allFiles().length > 0);

  /** Step → artifact → files, filtered by the search box (an artifact without files only shows when not searching). */
  protected readonly tree = computed<TreeStep[]>(() => {
    const query = this.query().trim().toLowerCase();
    return this.steps()
      .map((step) => ({
        stepId: step.stepId,
        artifacts: step.artifacts
          .map((a): TreeArtifact => ({ id: a.artifactId, name: a.name, files: a.files.filter((f) => this.matches(f, a.name, query)) }))
          .filter((a) => (query ? a.files.length > 0 : true)),
      }))
      .filter((step) => !query || step.artifacts.length > 0);
  });

  protected readonly orphanFiles = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.orphans().filter((f) => this.matches(f, '', query));
  });

  protected readonly noMatches = computed(() => !!this.query().trim() && !this.tree().length && !this.orphanFiles().length);

  /** The file shown: `?path=`, else the first file of `?artifact=`, else the first file of the project. */
  protected readonly selected = computed<ArtifactFile | null>(() => {
    const files = this.allFiles();
    const path = this.pathParam();
    if (path) return files.find((f) => f.path === path) ?? null;
    const artifact = this.artifactParam();
    if (artifact) return files.find((f) => f.artifactId === artifact && f.stepId !== null) ?? null;
    return files[0] ?? null;
  });

  /** `?artifact=` points at an artifact that has no file yet. */
  protected readonly emptyArtifact = computed(() => {
    const id = this.artifactParam();
    if (!id || this.pathParam() || this.selected()) return null;
    return this.steps().flatMap((s) => s.artifacts.map((a) => ({ stepId: s.stepId, artifact: a }))).find((x) => x.artifact.artifactId === id) ?? null;
  });

  protected readonly statusOptions = computed<SegmentedOption[]>(() =>
    REVIEW_STATUSES.map((status) => ({ value: status, label: this.i18n.t(`ar.st.${status}`) })),
  );
  protected readonly tones = STATUS_TONE;

  /** Re-reads the content only when the file changed on disk or in git, not on a status change. */
  private readonly contentKey = computed(() => {
    const file = this.selected();
    return file ? `${file.path}|${file.updatedAt}|${file.version}|${file.uncommitted}` : null;
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      const ready = !!this.project();
      if (id && ready && this.projects.loaded()) untracked(() => void this.store.load(id));
    });
    effect(() => {
      const key = this.contentKey();
      const id = untracked(() => this.projectId());
      const path = untracked(() => this.selected()?.path);
      if (key && id && path) untracked(() => void this.read(id, path, key));
      else untracked(() => this.content.set(null));
    });
  }

  protected onWindowFocus(): void {
    const id = this.projectId();
    if (id && this.project()) void this.store.load(id);
  }

  protected select(path: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { path, artifact: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected selectArtifact(artifact: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { artifact, path: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected async setStatus(file: ArtifactFile, value: string): Promise<void> {
    const id = this.projectId();
    if (id && value !== file.status) await this.store.setStatus(id, file.path, value as ReviewStatus);
  }

  protected openInVsCode(file: ArtifactFile): Promise<void> {
    return this.act((id) => this.service.openInVsCode(id, file.path));
  }

  protected reveal(file: ArtifactFile): Promise<void> {
    return this.act((id) => this.service.reveal(id, file.path));
  }

  protected async copy(): Promise<void> {
    const text = this.content()?.text;
    if (text === undefined) return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show(this.i18n.t('ar.copied'), { icon: 'copy' });
    } catch {
      this.toast.show(this.i18n.t('ar.err.copy'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  protected fileName(file: ArtifactFile): string {
    return artifactFileName(file.path);
  }

  protected date(iso: string): string {
    return formatDate(iso, this.i18n.lang());
  }

  protected cliName(file: ArtifactFile): string {
    return file.cli ? ((AGENT_NAMES as Record<string, string>)[file.cli] ?? file.cli) : '';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private matches(file: ArtifactFile, artifactName: string, query: string): boolean {
    return !query || file.path.toLowerCase().includes(query) || artifactName.toLowerCase().includes(query);
  }

  private async read(id: string, path: string, key: string): Promise<void> {
    this.reading.set(true);
    this.readFailed.set(false);
    try {
      const result = await this.service.read(id, path);
      if (this.contentKey() === key) this.content.set({ path, text: result.content });
    } catch (error) {
      console.error('Could not read the artifact', error);
      if (this.contentKey() === key) {
        this.content.set(null);
        this.readFailed.set(true);
      }
    } finally {
      if (this.contentKey() === key) this.reading.set(false);
    }
  }

  private async act(action: (id: string) => Promise<void>): Promise<void> {
    const id = this.projectId();
    if (!id) return;
    try {
      await action(id);
    } catch (error) {
      console.error('Artifact action failed', error);
      this.toast.show(this.i18n.t('ar.err.action'), { icon: 'circle-alert', tone: 'danger' });
    }
  }
}
