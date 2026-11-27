import type { Phase } from '@components/badge/phase-chip.component';
import type { TemplateOrigin } from '@features/projects/customization.model';
import type { TranslationKey } from '@shared/i18n/locales/en';

/** Change waiting for the save bar: what happens to an artifact's template file. */
export type StagedTemplate =
  | { action: 'upload'; name: string; content: string; size: number }
  | { action: 'remove' }
  | { action: 'restoreDefault' };

/** The template of an artifact as the user currently sees it (saved, or with a staged change applied). */
export interface TemplateView {
  name: string;
  /** Bytes. */
  size: number;
  origin: TemplateOrigin;
  /** A change not saved yet. */
  pending: boolean;
  /** The content can be shown (a pending restore has none until it is saved). */
  previewable: boolean;
}

export interface ArtifactView {
  id: string;
  name: string;
  template: TemplateView | null;
  /** The artifact has a bundled template and the current one is not the untouched default. */
  canRestore: boolean;
}

export interface StepView {
  id: string;
  instructions: string;
  /** The instructions differ from the bundled default. */
  custom: boolean;
  artifacts: ArtifactView[];
}

/** Built-in definition of one step. */
export interface StepDefinition {
  id: string;
  name: TranslationKey;
  icon: string;
  /** Default instructions of a phase that is not customized from bundled files yet. */
  instructions?: TranslationKey;
  artifacts: TranslationKey[];
}

/** Built-in definition of one phase. */
export interface PhaseDefinition {
  id: Phase;
  label: TranslationKey;
  icon: string;
  /** Project page of the phase (route segment). */
  segment: string;
  /** Steps can be turned off. */
  optional: boolean;
  /** Default prompt of a phase that is not customized from bundled files yet. */
  prompt?: TranslationKey;
  steps: StepDefinition[];
}

const step = (phase: string, id: string, icon: string, artifacts: TranslationKey[] = [], name?: TranslationKey): StepDefinition => ({
  id,
  icon,
  artifacts,
  name: name ?? (`cz.${phase}.${id}` as TranslationKey),
  instructions: `cz.${phase}.${id}.instr` as TranslationKey,
});

/**
 * Steps of each phase. Only Initial is customizable for now: its prompt, instructions and artifacts come from the
 * project (bundled defaults seeded when it is created). Scaffolding and SDLC are kept for when they are enabled.
 */
export const PHASES: PhaseDefinition[] = [
  {
    id: 'initial',
    label: 'phase.initial',
    icon: 'compass',
    segment: 'initial',
    optional: false,
    steps: [
      { id: 'discovery', icon: 'compass', name: 'in.step.discovery', artifacts: [] },
      { id: 'requirements', icon: 'list-checks', name: 'in.step.requirements', artifacts: [] },
      { id: 'scope', icon: 'target', name: 'in.step.scope', artifacts: [] },
      { id: 'estimation', icon: 'calculator', name: 'in.step.estimation', artifacts: [] },
      { id: 'signoff', icon: 'file-pen-line', name: 'in.step.signoff', artifacts: [] },
    ],
  },
  {
    id: 'release',
    label: 'phase.release',
    icon: 'blocks',
    segment: 'scaffolding',
    optional: true,
    prompt: 'cz.release.prompt',
    steps: [
      step('release', 'structure', 'folder-tree', ['cz.art.arch', 'cz.art.adr']),
      step('release', 'skeleton', 'boxes'),
      step('release', 'iac', 'server-cog', ['cz.art.runbook']),
      step('release', 'cicd', 'workflow'),
      step('release', 'devcontainer', 'container'),
      step('release', 'linttest', 'flask-conical'),
    ],
  },
  {
    id: 'sdlc',
    label: 'phase.sdlc',
    icon: 'infinity',
    segment: 'board',
    optional: true,
    prompt: 'cz.sdlc.prompt',
    steps: [
      step('sdlc', 'plan', 'drafting-compass', ['cz.art.plan']),
      step('sdlc', 'implement', 'bot'),
      step('sdlc', 'verify', 'flask-conical', ['cz.art.evidence']),
      step('sdlc', 'review', 'eye', ['cz.art.summary']),
    ],
  },
];

/** The phase customized in Project settings. */
export const INITIAL_PHASE = PHASES[0];

/** Size label of a template. */
export function fileSizeLabel(bytes: number): string {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
