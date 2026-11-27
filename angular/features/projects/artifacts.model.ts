import type { AgentId } from '@features/settings/app-settings.model';

import type { DocumentLanguage } from './projects.model';

export type ReviewStatus = 'draft' | 'review' | 'approved';
export const REVIEW_STATUSES: ReviewStatus[] = ['draft', 'review', 'approved'];

/** State of a step of the Initial phase, computed by the backend. */
export type StepStatus = 'done' | 'review' | 'current' | 'todo';

/** Mirrors `ArtifactFile` in desktop/src/features/projects/artifacts/catalog.rs. */
export interface ArtifactFile {
  /** Relative to the project directory, forward slashes: `artifacts/initial/brd/business-requirements.md`. */
  path: string;
  /** Folder name. */
  artifactId: string;
  /** `null` = the folder is not in the customization any more. */
  stepId: string | null;
  status: ReviewStatus;
  /** Commits touching the file (0 = never committed). */
  version: number;
  /** ISO 8601: last commit date, or the file's modified time while uncommitted. */
  updatedAt: string;
  by: 'agent' | 'user' | null;
  cli: string | null;
  model: string | null;
  runId: string | null;
  /** A change in the working tree that is not in git yet. */
  uncommitted: boolean;
}

/** Mirrors `StepArtifact` in desktop/src/features/projects/artifacts/catalog.rs. */
export interface StepArtifact {
  artifactId: string;
  name: string;
  files: ArtifactFile[];
}

/** Mirrors `StepState` in desktop/src/features/projects/artifacts/catalog.rs. */
export interface StepState {
  stepId: string;
  status: StepStatus;
  /** A successful run exists. */
  generated: boolean;
  /** Some earlier step is not generated yet. */
  locked: boolean;
  artifacts: StepArtifact[];
}

/** Mirrors `ArtifactsOverview` in desktop/src/features/projects/artifacts/catalog.rs. */
export interface ArtifactsOverview {
  gitAvailable: boolean;
  documentLanguage: DocumentLanguage | null;
  /** The 5 Initial steps in order; empty when the project has no customization. */
  steps: StepState[];
  /** Files in folders that are not in the customization any more. */
  orphans: ArtifactFile[];
  running: { runId: string; stepId: string } | null;
  /** Sources the agent cannot read (audio, video, office, archive, stored-only). */
  unreadableSources: number;
  /** The CLI of the project (`.procheck/settings.json`); `null` when the settings are missing. */
  cli: AgentId | null;
}

/** Result of `artifacts_read`. */
export interface ArtifactContent {
  file: ArtifactFile;
  content: string;
}

/** Something the user should look at after a run; the UI words each code in its own language. */
export type GenerateWarning =
  /** Changes outside `artifacts/initial/` (`paths` capped, `more` = the rest). Never restored automatically. */
  | { code: 'outsideChanges'; paths: string[]; more: number }
  /** A large (gitignored) source changed or was removed. */
  | { code: 'largeSourceChanged'; paths: string[]; more: number }
  | { code: 'unreadableSources'; count: number }
  /** Completed without changing any file (the step is not marked generated). */
  | { code: 'noChanges' };

export type GenerateOutcome = 'completed' | 'stopped' | 'failed';

/** Mirrors `GenerateResult` in desktop/src/features/projects/artifacts/generate.rs. */
export interface GenerateResult {
  runId: string;
  stepId: string;
  outcome: GenerateOutcome;
  /** Short hash when something was committed. */
  commit: string | null;
  /** Artifact paths written or changed by the run. */
  changed: string[];
  /** The agent's final message. */
  summary: string;
  warnings: GenerateWarning[];
  error: { code: string; message: string } | null;
}

/** Mirrors `GenerateEvent` in desktop/src/features/projects/artifacts/generate.rs. */
export type GenerateEvent =
  | { type: 'started'; runId: string; stepId: string }
  | { type: 'activity'; tool: string; path: string | null }
  | { type: 'text'; text: string }
  | { type: 'finished'; result: GenerateResult };

/** Error codes of `artifacts_generate` that reject before the run starts (`DesktopIpcError.code`). */
export type GenerateErrorCode =
  | 'busy'
  | 'stepLocked'
  | 'notSupported'
  | 'gitMissing'
  | 'cliMissing'
  | 'notSignedIn'
  | 'notFound'
  | 'notReady'
  | 'io'
  | 'storage';

/** Files of an artifact folder, as a single status: the least advanced one (draft < review < approved). */
export function combinedStatus(files: ArtifactFile[]): ReviewStatus | null {
  if (!files.length) return null;
  return REVIEW_STATUSES.find((status) => files.some((f) => f.status === status)) ?? 'draft';
}

/** File name of an artifact path. */
export function artifactFileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
