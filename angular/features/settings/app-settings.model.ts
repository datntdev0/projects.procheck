import type { Lang } from '@shared/i18n/i18n.service';
import type { ThemePreference } from '@shared/theme/theme.service';

/** What Procheck shows when it launches. */
export type StartupView = 'lastProject' | 'allProjects';
export const STARTUP_VIEWS: StartupView[] = ['lastProject', 'allProjects'];

/** Shape of `settings.json` (mirrors `AppSettings` in desktop/src/features/settings.rs). */
export interface AppSettings {
  version: number;
  general: GeneralSettings;
}

export interface GeneralSettings {
  theme: ThemePreference;
  language: Lang;
  /** Starting folder of the folder picker when a project is created; `null` = OS default. */
  defaultProjectDir: string | null;
  onStartup: StartupView;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  general: { theme: 'system', language: 'en', defaultProjectDir: null, onStartup: 'lastProject' },
};
