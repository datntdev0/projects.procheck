import type { Phase } from '@components/badge/phase-chip.component';
import type { AgentId } from '@features/settings/app-settings.model';

export type Methodology = 'scrum' | 'kanban' | 'hybrid';

export const PHASES: Phase[] = ['initial', 'release', 'sdlc'];

export const INDUSTRIES = ['fintech', 'retail', 'health', 'logistics', 'mfg', 'edu', 'other'] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** Mirrors `ProjectManifest` in desktop/src/features/projects.rs (`procheck.json`). */
export interface ProjectManifest {
  schemaVersion: number;
  id: string;
  name: string;
  code: string | null;
  client: string | null;
  industry: string | null;
  description: string | null;
  phase: Phase;
  methodology: Methodology | null;
  repository: string | null;
  createdAt: string;
}

export type ProjectStatus = 'ready' | 'missing' | 'invalid';

export interface ProjectItem {
  id: string;
  dir: string;
  lastOpenedAt: string;
  status: ProjectStatus;
  manifest: ProjectManifest | null;
}

/** A project whose `procheck.json` was read. */
export type ReadyProjectItem = ProjectItem & { manifest: ProjectManifest };

export type DirectoryCheck = 'available' | 'notAbsolute' | 'notDirectory' | 'notEmpty' | 'unreadable';

export type { SourceCandidate, SourceProblem } from '@features/sources/sources.model';

export type RepositoryStatus = 'ready' | 'notFound' | 'notRepository' | 'gitMissing';

export interface RepositoryInfo {
  path: string;
  status: RepositoryStatus;
  root: string | null;
  branch: string | null;
  clean: boolean | null;
}

/** Mirrors `ProjectUpdate` in desktop/src/features/projects/edit.rs (General section of Project settings). */
export interface ProjectUpdate {
  name: string;
  code: string | null;
  client: string | null;
  description: string | null;
  repository: string | null;
}

/** Error codes of `projects_update`, `projects_remove` and `projects_delete` (`DesktopIpcError.code`). */
export type EditErrorCode =
  | 'notFound'
  | 'notReady'
  | 'nameRequired'
  | 'repositoryRequired'
  | 'invalidRepository'
  | 'io'
  | 'storage';

/** Mirrors `NewProject` in desktop/src/features/projects/create.rs. */
export interface NewProject {
  name: string;
  code: string | null;
  client: string | null;
  industry: string | null;
  description: string | null;
  dir: string;
  phase: Phase;
  repository: string | null;
  sources: string[];
  cli: AgentId;
  model: string | null;
}

export type CreateProgress =
  | { step: 'directories' }
  | { step: 'source'; index: number; total: number; name: string }
  | { step: 'settings' }
  | { step: 'manifest' }
  | { step: 'registry' };

export type CreateStep = CreateProgress['step'];
export const CREATE_STEPS: CreateStep[] = ['directories', 'source', 'settings', 'manifest', 'registry'];

/** Error codes of `projects_create` (`DesktopIpcError.code`). */
export type CreateErrorCode =
  | 'nameRequired'
  | 'invalidDirectory'
  | 'repositoryRequired'
  | 'invalidRepository'
  | 'invalidSource'
  | 'io'
  | 'storage';
