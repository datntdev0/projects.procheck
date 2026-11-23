import type { Lang } from '@shared/i18n/i18n.service';
import type { ThemePreference } from '@shared/theme/theme.service';

/** What Procheck shows when it launches. */
export type StartupView = 'lastProject' | 'allProjects';
export const STARTUP_VIEWS: StartupView[] = ['lastProject', 'allProjects'];

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
/** Retention choices offered in Settings → Diagnostics (the file accepts 1–365). */
export const LOG_RETENTION_CHOICES = [7, 14, 30];

/** Shape of `settings.json` (mirrors `AppSettings` in desktop/src/features/settings.rs). */
export interface AppSettings {
  version: number;
  general: GeneralSettings;
  diagnostics: DiagnosticsSettings;
}

export interface GeneralSettings {
  theme: ThemePreference;
  language: Lang;
  /** Starting folder of the folder picker when a project is created; `null` = OS default. */
  defaultProjectDir: string | null;
  onStartup: StartupView;
}

export interface DiagnosticsSettings {
  logLevel: LogLevel;
  /** Log files older than this are deleted at startup. */
  logRetentionDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  general: { theme: 'system', language: 'en', defaultProjectDir: null, onStartup: 'lastProject' },
  diagnostics: { logLevel: 'info', logRetentionDays: 14 },
};
