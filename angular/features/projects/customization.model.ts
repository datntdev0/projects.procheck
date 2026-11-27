import type { DocumentLanguage } from './projects.model';

export type TemplateOrigin = 'default' | 'custom';

/** Mirrors `TemplateRef` in desktop/src/features/projects/customization.rs. */
export interface TemplateRef {
  /** Relative to `.procheck\templates\`, forward slashes: `initial/meeting.md`. */
  file: string;
  /** Display name (the original file name). */
  name: string;
  /** Bytes. */
  size: number;
  origin: TemplateOrigin;
  /** ISO 8601 UTC; empty in the bundled defaults. */
  updatedAt: string;
}

/** Mirrors `ArtifactCustomization` in desktop/src/features/projects/customization.rs. */
export interface ArtifactCustomization {
  id: string;
  name: string;
  template: TemplateRef | null;
}

/** Mirrors `StepCustomization` in desktop/src/features/projects/customization.rs. */
export interface StepCustomization {
  id: string;
  instructions: string;
  artifacts: ArtifactCustomization[];
}

/** Mirrors `PhaseCustomization` in desktop/src/features/projects/customization.rs. */
export interface PhaseCustomization {
  prompt: string;
  steps: StepCustomization[];
}

/** Mirrors `Customization` in desktop/src/features/projects/customization.rs (`.procheck\settings.json`). */
export interface Customization {
  schemaVersion: 1;
  phases: { initial: PhaseCustomization };
}

/** Result of `projects_customization_get`. */
export interface CustomizationView {
  /** `null` = the project was created before customization existed. */
  customization: Customization | null;
  /** Bundled defaults in the project's document language; `null` when the project has none. */
  defaults: PhaseCustomization | null;
  language: DocumentLanguage | null;
}

/** A template change saved together with the customization (the backend decides each artifact's `template`). */
export type TemplateChange =
  | { action: 'upload'; artifactId: string; name: string; content: string }
  | { action: 'remove'; artifactId: string }
  | { action: 'restoreDefault'; artifactId: string };

/** Result of `projects_template_read`. */
export interface TemplateContent {
  name: string;
  content: string;
}

/** Error codes of `projects_customization_save` (`DesktopIpcError.code`). */
export type CustomizationErrorCode =
  | 'templateType'
  | 'templateTooLarge'
  | 'invalidCustomization'
  | 'notSupported'
  | 'notReady'
  | 'notFound';

/** Largest template accepted, in bytes. */
export const TEMPLATE_MAX_BYTES = 1_048_576;
