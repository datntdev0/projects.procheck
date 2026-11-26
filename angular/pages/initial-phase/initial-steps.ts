import type { BadgeTone } from '@components/badge/badge.component';
import type { TranslationKey } from '@shared/i18n/locales/en';

/** Steps of the Initial phase, in order (see _proto/assets/workflow.js). */
export const INITIAL_STEPS = ['discovery', 'requirements', 'scope', 'estimation', 'signoff'] as const;
export type InitialStepId = (typeof INITIAL_STEPS)[number];

export type StepStatus = 'done' | 'current' | 'review' | 'stale' | 'todo';
export type ArtifactStatus = 'not_started' | 'draft' | 'review' | 'approved';

export interface StepArtifact {
  id: string;
  name: string;
  status: ArtifactStatus;
  /** Built on sources that changed since; needs an update. */
  stale?: boolean;
  version?: number;
}

export interface InitialStep {
  id: InitialStepId;
  status: StepStatus;
  artifacts: StepArtifact[];
  /** Date the step was completed (ISO), shown on done steps. */
  doneAt?: string | null;
}

export const STEP_BADGE: Record<StepStatus, BadgeTone> = {
  done: 'success',
  current: 'brand',
  review: 'warning',
  stale: 'warning',
  todo: 'neutral',
};

export const ARTIFACT_ICON: Record<ArtifactStatus, string> = {
  not_started: 'circle-dashed',
  draft: 'pencil',
  review: 'eye',
  approved: 'circle-check',
};

/** Default artifacts of each step (Procheck default workflow). */
export const DEFAULT_ARTIFACTS: Record<InitialStepId, { id: string; name: TranslationKey }[]> = {
  discovery: [
    { id: 'meeting', name: 'in.art.meeting' },
    { id: 'disc', name: 'in.art.disc' },
  ],
  requirements: [{ id: 'brd', name: 'in.art.brd' }],
  scope: [{ id: 'scope', name: 'in.art.scope' }],
  estimation: [{ id: 'est', name: 'in.art.est' }],
  signoff: [{ id: 'sow', name: 'in.art.sow' }],
};

export const isApproved = (artifact: StepArtifact): boolean => artifact.status === 'approved' && !artifact.stale;

/** Progress weight of an artifact, as in the prototype. */
const WEIGHT: Record<ArtifactStatus, number> = { approved: 1, review: 0.6, draft: 0.3, not_started: 0 };

/** Phase completion 0–100 from the artifacts of every step. */
export function phasePercent(steps: InitialStep[]): number {
  const artifacts = steps.flatMap((step) => step.artifacts);
  if (!artifacts.length) return 0;
  const score = artifacts.reduce((sum, a) => sum + (a.stale ? 0.5 : WEIGHT[a.status]), 0);
  return Math.round((score / artifacts.length) * 100);
}
