import type { Phase } from '@components/badge/phase-chip.component';
import type { TranslationKey } from '@shared/i18n/locales/en';

/** A template file attached to an artifact: any document type, copied to `.procheck\templates\`. */
export interface StepTemplateFile {
  name: string;
  /** Human-readable size, e.g. `84 KB`. */
  size: string;
}

/** One artifact a step produces: a free name and an optional template. */
export interface StepArtifactConfig {
  /** Stable key for rendering; not shown. */
  key: string;
  name: string;
  template: StepTemplateFile | null;
}

/** What one step does (free-text instructions) and what it produces. */
export interface StepConfig {
  id: string;
  /** `null` = the Procheck default text in the current language. */
  instructions: string | null;
  /** Turned off for this project (only in phases whose steps are optional); its settings are kept. */
  off: boolean;
  artifacts: StepArtifactConfig[];
}

/** Customization of one phase: the phase prompt and its steps. */
export interface PhaseConfig {
  /** `null` = the Procheck default prompt. */
  prompt: string | null;
  steps: StepConfig[];
}

/** Built-in definition of one step. */
export interface StepDefinition {
  id: string;
  name: TranslationKey;
  icon: string;
  instructions: TranslationKey;
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
  prompt: TranslationKey;
  steps: StepDefinition[];
}

const step = (phase: string, id: string, icon: string, artifacts: TranslationKey[] = [], name?: TranslationKey): StepDefinition => ({
  id,
  icon,
  artifacts,
  name: name ?? (`cz.${phase}.${id}` as TranslationKey),
  instructions: `cz.${phase}.${id}.instr` as TranslationKey,
});

/** Procheck default customization (see _proto/assets/workflow.js). */
export const PHASES: PhaseDefinition[] = [
  {
    id: 'initial',
    label: 'phase.initial',
    icon: 'compass',
    segment: 'initial',
    optional: false,
    prompt: 'cz.initial.prompt',
    steps: [
      step('initial', 'discovery', 'compass', ['in.art.meeting', 'in.art.disc'], 'in.step.discovery'),
      step('initial', 'requirements', 'list-checks', ['in.art.brd'], 'in.step.requirements'),
      step('initial', 'scope', 'target', ['in.art.scope'], 'in.step.scope'),
      step('initial', 'estimation', 'calculator', ['in.art.est'], 'in.step.estimation'),
      step('initial', 'signoff', 'file-pen-line', ['in.art.sow'], 'in.step.signoff'),
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

/** Size label of a picked file. */
export function fileSizeLabel(bytes: number): string {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
