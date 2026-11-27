import type { BadgeTone } from '@components/badge/badge.component';
import { StepState, combinedStatus } from '@features/projects/artifacts.model';

/** Steps of the Initial phase, in order (see _proto/assets/workflow.js). */
export const INITIAL_STEPS = ['discovery', 'requirements', 'scope', 'estimation', 'signoff'] as const;
export type InitialStepId = (typeof INITIAL_STEPS)[number];

export type StepStatus = 'done' | 'current' | 'review' | 'stale' | 'todo';
export type ArtifactStatus = 'not_started' | 'draft' | 'review' | 'approved';

export interface StepArtifact {
  id: string;
  name: string;
  /** The least advanced status of its files; `not_started` while it has none. */
  status: ArtifactStatus;
  /** Built on sources that changed since; needs an update. */
  stale?: boolean;
  /** Highest version among its files. */
  version?: number;
  /** Number of files in the artifact folder (an artifact can hold several). */
  files: number;
  /** The path of the file when the artifact has exactly one. */
  path: string | null;
  /** Some file has changes that are not in git yet. */
  uncommitted: boolean;
}

export interface InitialStep {
  id: InitialStepId;
  status: StepStatus;
  artifacts: StepArtifact[];
  /** Some earlier step has not been generated yet. */
  locked: boolean;
  /** Files of the step already approved (updating them sends them back to Draft). */
  approvedFiles: number;
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

/** A step before anything is known about the project: no artifacts yet, Discovery is the current one. */
export function emptySteps(): InitialStep[] {
  return INITIAL_STEPS.map((id, i) => ({
    id,
    status: i === 0 ? 'current' : 'todo',
    artifacts: [],
    locked: false,
    approvedFiles: 0,
  }));
}

/** Steps of the Initial phase as the backend reports them (real artifact names, files and statuses). */
export function toInitialSteps(states: StepState[]): InitialStep[] {
  return states.map((state) => {
    const files = state.artifacts.flatMap((a) => a.files);
    return {
      id: state.stepId as InitialStepId,
      status: state.status,
      locked: state.locked,
      approvedFiles: files.filter((f) => f.status === 'approved').length,
      doneAt: state.status === 'done' ? files.map((f) => f.updatedAt).sort().at(-1) : null,
      artifacts: state.artifacts.map((a) => ({
        id: a.artifactId,
        name: a.name,
        status: combinedStatus(a.files) ?? 'not_started',
        version: Math.max(0, ...a.files.map((f) => f.version)) || undefined,
        files: a.files.length,
        path: a.files.length === 1 ? a.files[0].path : null,
        uncommitted: a.files.some((f) => f.uncommitted),
      })),
    };
  });
}

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
