import type { Lang } from '@shared/i18n/i18n.service';
import type { ThemePreference } from '@shared/theme/theme.service';

/** What Procheck shows when it launches. */
export type StartupView = 'lastProject' | 'allProjects';
export const STARTUP_VIEWS: StartupView[] = ['lastProject', 'allProjects'];

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
/** Retention choices offered in Settings → Diagnostics (the file accepts 1–365). */
export const LOG_RETENTION_CHOICES = [7, 14, 30];

/** AI CLI tools Procheck can drive. */
export type AgentId = 'claude' | 'codex';
export const AGENT_IDS: AgentId[] = ['claude', 'codex'];

/** Shape of `settings.json` (mirrors `AppSettings` in desktop/src/features/settings.rs). */
export interface AppSettings {
  version: number;
  general: GeneralSettings;
  diagnostics: DiagnosticsSettings;
  agents: AgentsSettings;
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

/** Settings → Agent Integration. Projects use these unless they override them. */
export interface AgentsSettings {
  /** CLI used when a project does not choose one. */
  defaultAgent: AgentId;
  claude: AgentSettings;
  codex: AgentSettings;
}

export interface AgentSettings {
  /** Executable to run; `null` = find it on PATH. */
  binPath: string | null;
  /** Model passed to the CLI; `null` = the CLI's own default. */
  model: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  general: { theme: 'system', language: 'en', defaultProjectDir: null, onStartup: 'lastProject' },
  diagnostics: { logLevel: 'info', logRetentionDays: 14 },
  agents: {
    defaultAgent: 'claude',
    claude: { binPath: null, model: null },
    codex: { binPath: null, model: null },
  },
};
