import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ToastService } from '@components/toast/toast.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';

import { ArtifactFile, ArtifactsOverview, GenerateEvent, GenerateResult, ReviewStatus } from './artifacts.model';
import { ArtifactsService } from './artifacts.service';

/** A step being generated: what the agent is doing right now. */
export interface RunState {
  stepId: string;
  runId: string | null;
  /** Latest tool the agent used, e.g. Read `sources/rfp.pdf`. */
  activity: { tool: string; path: string | null } | null;
  /** Latest line of the agent's prose. */
  text: string;
  /** Epoch ms; 0 when the run was started elsewhere (before this window opened). */
  startedAt: number;
  stopping: boolean;
}

/** Errors that reject `artifacts_generate` before the run starts, with a dedicated message. */
const START_ERRORS: Partial<Record<string, TranslationKey>> = {
  busy: 'gen.err.busy',
  stepLocked: 'gen.err.stepLocked',
  notSupported: 'gen.err.notSupported',
  gitMissing: 'gen.err.gitMissing',
  cliMissing: 'gen.err.cliMissing',
  notSignedIn: 'gen.err.notSignedIn',
};

const EXTERNAL_POLL_MS = 3000;
const TEXT_BUFFER_MAX = 2000;

/**
 * Artifacts of the projects opened in this session and the generation run of each, shared by the Initial phase
 * and Artifacts pages so a run survives navigation. One run per project.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactsStore {
  private readonly service = inject(ArtifactsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  private readonly overviews = signal<Record<string, ArtifactsOverview>>({});
  private readonly loadedIds = signal<ReadonlySet<string>>(new Set());
  private readonly runs = signal<Record<string, RunState>>({});
  private readonly results = signal<Record<string, GenerateResult>>({});
  private readonly buffers = new Map<string, string>();
  private readonly polls = new Map<string, ReturnType<typeof setTimeout>>();

  overview(id: string | null): ArtifactsOverview | null {
    return id ? (this.overviews()[id] ?? null) : null;
  }

  /** The first overview of the project has been read (or failed). */
  loaded(id: string | null): boolean {
    return !!id && this.loadedIds().has(id);
  }

  /** The run of the project: started from this window, or found running in the overview. */
  running(id: string | null): RunState | null {
    if (!id) return null;
    const own = this.runs()[id];
    if (own) return own;
    const external = this.overviews()[id]?.running;
    return external ? { stepId: external.stepId, runId: external.runId, activity: null, text: '', startedAt: 0, stopping: false } : null;
  }

  /** Outcome of the last run of a step, shown until dismissed. */
  lastResult(id: string | null, stepId: string): GenerateResult | null {
    return id ? (this.results()[`${id}:${stepId}`] ?? null) : null;
  }

  dismissResult(id: string, stepId: string): void {
    this.results.update(({ [`${id}:${stepId}`]: _dropped, ...rest }) => rest);
  }

  async load(id: string): Promise<void> {
    try {
      const overview = await this.service.overview(id);
      this.overviews.update((all) => ({ ...all, [id]: overview }));
      this.followExternalRun(id, overview);
    } catch (error) {
      console.error('Could not read the artifacts of the project', error);
    } finally {
      this.loadedIds.update((ids) => new Set(ids).add(id));
    }
  }

  /** Runs the project's CLI as an agent for a step. Resolves when the run has ended and was reported. */
  async generate(id: string, stepId: string): Promise<void> {
    if (this.running(id)) return;
    this.dismissResult(id, stepId);
    this.buffers.delete(id);
    this.runs.update((all) => ({ ...all, [id]: { stepId, runId: null, activity: null, text: '', startedAt: Date.now(), stopping: false } }));
    try {
      this.finish(id, await this.service.generate(id, stepId, (event) => this.onEvent(id, event)));
    } catch (error) {
      this.clearRun(id);
      this.reportStartFailure(error);
    }
    await this.load(id);
  }

  async stop(id: string): Promise<void> {
    this.patchRun(id, { stopping: true });
    try {
      await this.service.stop(id);
    } catch (error) {
      console.error('Could not stop the run', error);
      this.patchRun(id, { stopping: false });
      this.toast.show(this.i18n.t('gen.err.stop'), { icon: 'circle-alert', tone: 'danger' });
    }
  }

  /** Changes the review status of a file; resolves to whether it worked (a toast tells otherwise). */
  async setStatus(id: string, path: string, status: ReviewStatus): Promise<boolean> {
    try {
      this.patchFile(id, await this.service.setStatus(id, path, status));
      void this.load(id);
      return true;
    } catch (error) {
      console.error('Could not change the status', error);
      this.toast.show(this.i18n.t('ar.err.status'), { icon: 'circle-alert', tone: 'danger' });
      return false;
    }
  }

  private onEvent(id: string, event: GenerateEvent): void {
    switch (event.type) {
      case 'started':
        this.patchRun(id, { runId: event.runId });
        break;
      case 'activity':
        this.patchRun(id, { activity: { tool: event.tool, path: event.path } });
        break;
      case 'text':
        this.patchRun(id, { text: this.latestLine(id, event.text) });
        break;
      case 'finished':
        this.finish(id, event.result);
        break;
    }
  }

  /** Keeps a short tail of the agent's prose and returns its latest non-empty line. */
  private latestLine(id: string, delta: string): string {
    const buffer = ((this.buffers.get(id) ?? '') + delta).slice(-TEXT_BUFFER_MAX);
    this.buffers.set(id, buffer);
    const lines = buffer.split('\n').map((l) => l.trim());
    return lines.reverse().find(Boolean) ?? '';
  }

  /** Records the outcome and tells the user; called once per run (by the event or by the command's result). */
  private finish(id: string, result: GenerateResult): void {
    if (!this.runs()[id]) return;
    this.clearRun(id);
    this.results.update((all) => ({ ...all, [`${id}:${result.stepId}`]: result }));
    void this.load(id);

    if (result.outcome === 'completed') {
      const first = result.changed[0];
      this.toast.show(this.i18n.t('gen.t.done', { n: result.changed.length }), {
        icon: 'circle-check',
        tone: 'success',
        duration: 8000,
        action: { label: this.i18n.t('gen.t.view'), run: () => void this.openArtifacts(id, first) },
      });
    } else if (result.outcome === 'stopped') {
      this.toast.show(this.i18n.t('gen.t.stopped'), { icon: 'square', tone: 'warning', duration: 8000 });
    } else {
      const reason = result.error?.message || this.i18n.t('gen.err.other');
      this.toast.show(this.i18n.t('gen.t.failed', { reason }), { icon: 'circle-alert', tone: 'danger', duration: 9000 });
    }
  }

  private reportStartFailure(error: unknown): void {
    console.error('Could not generate the step', error);
    const failure = error instanceof DesktopIpcError ? error : null;
    const known = failure?.code ? START_ERRORS[failure.code] : undefined;
    const message = known ? this.i18n.t(known) : this.i18n.t('gen.err.start', { reason: failure?.reason ?? String(error) });
    this.toast.show(message, { icon: 'circle-alert', tone: 'danger', duration: 7000 });
  }

  private openArtifacts(id: string, path: string | undefined): Promise<boolean> {
    return this.router.navigate(['/projects', id, 'artifacts'], { queryParams: path ? { path } : {} });
  }

  private patchRun(id: string, changes: Partial<RunState>): void {
    this.runs.update((all) => (all[id] ? { ...all, [id]: { ...all[id], ...changes } } : all));
  }

  private clearRun(id: string): void {
    this.buffers.delete(id);
    this.runs.update(({ [id]: _dropped, ...rest }) => rest);
  }

  private patchFile(id: string, file: ArtifactFile): void {
    const replace = (f: ArtifactFile) => (f.path === file.path ? file : f);
    this.overviews.update((all) => {
      const overview = all[id];
      if (!overview) return all;
      const steps = overview.steps.map((s) => ({ ...s, artifacts: s.artifacts.map((a) => ({ ...a, files: a.files.map(replace) })) }));
      return { ...all, [id]: { ...overview, steps, orphans: overview.orphans.map(replace) } };
    });
  }

  /** A run started before this window opened (or from another one): follow it until it ends. */
  private followExternalRun(id: string, overview: ArtifactsOverview): void {
    clearTimeout(this.polls.get(id));
    this.polls.delete(id);
    if (!overview.running || this.runs()[id]) return;
    this.polls.set(id, setTimeout(() => void this.load(id), EXTERNAL_POLL_MS));
  }
}
