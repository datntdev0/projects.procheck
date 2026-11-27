import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import {
  ArtifactCustomization,
  CustomizationView,
  PhaseCustomization,
  StepCustomization,
  TEMPLATE_MAX_BYTES,
  TemplateChange,
  TemplateContent,
  TemplateRef,
} from '@features/projects/customization.model';
import { CustomizationService } from '@features/projects/customization.service';
import { injectCurrentProject } from '@layout/current-project';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';

import { StagedTemplate, TemplateView } from './sections/customization/customization.model';
import type { ProjectSaveResult } from './project-settings-form';

export type CustomizationStatus = 'loading' | 'ready' | 'error';

/** Why a picked file was not staged as a template. */
export type TemplateUploadResult = 'ok' | 'templateType' | 'templateTooLarge' | 'unreadable';

/** `a-` + 8 lowercase hex characters, the id of an artifact added in the UI. */
function newArtifactId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `a-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function artifactsOf(phase: PhaseCustomization | null): ArtifactCustomization[] {
  return phase?.steps.flatMap((s) => s.artifacts) ?? [];
}

/** Compares everything the user can edit; template refs are ignored (they follow the staged changes). */
function samePhase(a: PhaseCustomization, b: PhaseCustomization): boolean {
  const key = (phase: PhaseCustomization) =>
    JSON.stringify([phase.prompt, phase.steps.map((s) => [s.id, s.instructions, s.artifacts.map((x) => [x.id, x.name])])]);
  return key(a) === key(b);
}

/**
 * Edits of the Initial phase customization (prompt, step instructions, artifacts, templates), saved to
 * `.procheck\settings.json` and `.procheck\templates\` through the save bar. Provided by the page.
 * Uploaded files are held here until Save, so Discard drops them.
 */
@Injectable()
export class ProjectCustomizationForm {
  private readonly service = inject(CustomizationService);

  readonly project = injectCurrentProject();
  private readonly projectId = computed(() => this.project()?.id ?? null);
  readonly status = signal<CustomizationStatus>('loading');
  readonly saving = signal(false);

  private readonly view = signal<CustomizationView | null>(null);
  private readonly draft = signal<PhaseCustomization | null>(null);
  private readonly staged = signal<Record<string, StagedTemplate>>({});

  private readonly saved = computed(() => this.view()?.customization?.phases.initial ?? null);

  /** Bundled defaults in the project's document language. */
  readonly defaults = computed(() => this.view()?.defaults ?? null);
  /** The phase being edited; `null` when the project has no customization. */
  readonly phase = computed(() => this.draft() ?? this.saved());

  /** Template changes that still apply: those of artifacts that are still in the phase. */
  private readonly changes = computed<TemplateChange[]>(() => {
    const ids = new Set(artifactsOf(this.phase()).map((a) => a.id));
    return Object.entries(this.staged())
      .filter(([artifactId]) => ids.has(artifactId))
      .map(([artifactId, change]): TemplateChange => {
        if (change.action === 'upload') return { action: 'upload', artifactId, name: change.name, content: change.content };
        return { action: change.action, artifactId };
      });
  });

  readonly dirty = computed(() => {
    const saved = this.saved();
    const draft = this.draft();
    return !!saved && ((!!draft && !samePhase(draft, saved)) || this.changes().length > 0);
  });
  /** An artifact has no name; the save bar cannot save then. */
  readonly invalid = computed(() => this.dirty() && artifactsOf(this.phase()).some((a) => !a.name.trim()));

  constructor() {
    effect(() => {
      const id = this.projectId();
      if (id) untracked(() => void this.load(id));
    });
  }

  async load(id: string | null = this.projectId()): Promise<void> {
    if (!id) return;
    this.status.set('loading');
    this.view.set(null);
    this.discard();
    try {
      const view = await this.service.get(id);
      if (this.projectId() !== id) return;
      this.view.set(view);
      this.status.set('ready');
    } catch (error) {
      if (this.projectId() !== id) return;
      console.error('Could not load the project customization', error);
      this.status.set('error');
    }
  }

  setPrompt(prompt: string): void {
    this.update((phase) => ({ ...phase, prompt }));
  }

  setInstructions(stepId: string, instructions: string): void {
    this.updateStep(stepId, (step) => ({ ...step, instructions }));
  }

  addArtifact(stepId: string): void {
    this.updateStep(stepId, (step) => ({ ...step, artifacts: [...step.artifacts, { id: newArtifactId(), name: '', template: null }] }));
  }

  renameArtifact(artifactId: string, name: string): void {
    this.updateArtifacts((artifact) => (artifact.id === artifactId ? { ...artifact, name } : artifact));
  }

  removeArtifact(artifactId: string): void {
    this.update((phase) => ({ ...phase, steps: phase.steps.map((s) => ({ ...s, artifacts: s.artifacts.filter((a) => a.id !== artifactId) })) }));
    this.unstage(artifactId);
  }

  /** Checks and reads a picked `.md` file and stages it as the artifact's template; nothing changes unless it resolves to `ok`. */
  async stageUpload(artifactId: string, file: File): Promise<TemplateUploadResult> {
    if (!file.name.toLowerCase().endsWith('.md')) return 'templateType';
    if (file.size > TEMPLATE_MAX_BYTES) return 'templateTooLarge';
    let content: string;
    try {
      content = await file.text();
    } catch (error) {
      console.error('Could not read the template file', error);
      return 'unreadable';
    }
    this.stage(artifactId, { action: 'upload', name: file.name, content, size: file.size });
    return 'ok';
  }

  removeTemplate(artifactId: string): void {
    if (this.savedTemplate(artifactId)) this.stage(artifactId, { action: 'remove' });
    else this.unstage(artifactId);
  }

  /** Puts the bundled template back; when the saved one already is the untouched default, it only drops the staged change. */
  restoreTemplate(artifactId: string): void {
    if (this.savedTemplate(artifactId)?.origin === 'default') this.unstage(artifactId);
    else this.stage(artifactId, { action: 'restoreDefault' });
  }

  /** The phase goes back to the bundled defaults: prompt, instructions, artifacts and their templates. */
  resetPhase(): void {
    const defaults = this.defaults();
    if (!defaults) return;
    const staged: Record<string, StagedTemplate> = {};
    for (const artifact of artifactsOf(defaults)) {
      const saved = this.savedTemplate(artifact.id);
      if (artifact.template) {
        if (saved?.origin !== 'default') staged[artifact.id] = { action: 'restoreDefault' };
      } else if (saved) {
        staged[artifact.id] = { action: 'remove' };
      }
    }
    this.draft.set(structuredClone(defaults));
    this.staged.set(staged);
  }

  /** The template of an artifact with its staged change applied. */
  template(artifactId: string): TemplateView | null {
    const change = this.staged()[artifactId];
    if (change?.action === 'upload') return { name: change.name, size: change.size, origin: 'custom', pending: true, previewable: true };
    if (change?.action === 'remove') return null;
    if (change?.action === 'restoreDefault') {
      const ref = this.defaultTemplate(artifactId);
      return ref && { name: ref.name, size: ref.size, origin: 'default', pending: true, previewable: false };
    }
    const ref = this.savedTemplate(artifactId);
    return ref && { name: ref.name, size: ref.size, origin: ref.origin, pending: false, previewable: true };
  }

  /** The artifact has a bundled template and the current one is not the untouched default. */
  canRestore(artifactId: string): boolean {
    return !!this.defaultTemplate(artifactId) && this.template(artifactId)?.origin !== 'default';
  }

  /** Content of the template: the staged file, or else the saved one read from the project. */
  async readTemplate(artifactId: string): Promise<TemplateContent> {
    const change = this.staged()[artifactId];
    if (change?.action === 'upload') return { name: change.name, content: change.content };
    const id = this.projectId();
    if (!id) throw new Error('No project');
    return this.service.readTemplate(id, artifactId);
  }

  discard(): void {
    this.draft.set(null);
    this.staged.set({});
  }

  async save(): Promise<ProjectSaveResult> {
    const id = this.projectId();
    const phase = this.phase();
    if (!id || !phase) return { ok: false, code: 'notFound', message: '' };
    this.saving.set(true);
    try {
      const initial: PhaseCustomization = {
        ...phase,
        steps: phase.steps.map((s) => ({ ...s, artifacts: s.artifacts.map((a) => ({ ...a, name: a.name.trim() })) })),
      };
      const customization = await this.service.save(id, { schemaVersion: 1, phases: { initial } }, this.changes());
      if (this.projectId() === id) {
        this.view.update((view) => view && { ...view, customization });
        this.discard();
      }
      return { ok: true };
    } catch (error) {
      const failure = error instanceof DesktopIpcError ? error : null;
      return { ok: false, code: failure?.code ?? null, message: failure?.reason ?? String(error) };
    } finally {
      this.saving.set(false);
    }
  }

  private savedTemplate(artifactId: string): TemplateRef | null {
    return artifactsOf(this.saved()).find((a) => a.id === artifactId)?.template ?? null;
  }

  private defaultTemplate(artifactId: string): TemplateRef | null {
    return artifactsOf(this.defaults()).find((a) => a.id === artifactId)?.template ?? null;
  }

  private stage(artifactId: string, change: StagedTemplate): void {
    this.staged.update((staged) => ({ ...staged, [artifactId]: change }));
  }

  private unstage(artifactId: string): void {
    this.staged.update(({ [artifactId]: _dropped, ...rest }) => rest);
  }

  private update(change: (phase: PhaseCustomization) => PhaseCustomization): void {
    const phase = this.phase();
    if (phase) this.draft.set(change(phase));
  }

  private updateStep(stepId: string, change: (step: StepCustomization) => StepCustomization): void {
    this.update((phase) => ({ ...phase, steps: phase.steps.map((s) => (s.id === stepId ? change(s) : s)) }));
  }

  private updateArtifacts(change: (artifact: ArtifactCustomization) => ArtifactCustomization): void {
    this.update((phase) => ({ ...phase, steps: phase.steps.map((s) => ({ ...s, artifacts: s.artifacts.map(change) })) }));
  }
}
