import { EnvironmentProviders, Injectable, effect, inject, provideAppInitializer, signal, untracked } from '@angular/core';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { I18nService } from '@shared/i18n/i18n.service';
import { ThemeService } from '@shared/theme/theme.service';

import { AppSettings, DEFAULT_SETTINGS } from './app-settings.model';

interface SettingsSnapshot {
  path: string;
  settings: AppSettings;
}

/**
 * App settings stored in `settings.json` in the application data directory.
 * Loaded once at startup; every change goes through `update()`, which saves the whole
 * document through the desktop app. Saves run one after another, in call order.
 *
 * Theme and language stay owned by ThemeService / I18nService (they also keep a
 * localStorage copy for the pre-paint script); this service applies the stored values
 * at startup and writes them back whenever they change anywhere in the app.
 */
@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly theme = inject(ThemeService);
  private readonly i18n = inject(I18nService);

  private readonly state = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly settings = this.state.asReadonly();
  /** Absolute path of settings.json; `null` until loaded or outside the desktop app. */
  readonly filePath = signal<string | null>(null);
  /** False outside the desktop app (Storybook, plain browser): changes then stay in memory. */
  readonly persistent = signal(false);

  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    effect(() => {
      const theme = this.theme.preference();
      const language = this.i18n.lang();
      if (!this.persistent()) return;
      untracked(() => {
        const general = this.state().general;
        if (general.theme === theme && general.language === language) return;
        this.update((s) => ({ ...s, general: { ...s.general, theme, language } })).catch((error: unknown) =>
          console.error('Could not save theme / language', error),
        );
      });
    });
  }

  /** Reads settings.json and applies theme and language. Outside the desktop app the defaults stay. */
  async load(): Promise<void> {
    try {
      const snapshot = await this.ipc.invoke<SettingsSnapshot>('settings_get');
      this.state.set(snapshot.settings);
      this.filePath.set(snapshot.path);
      this.theme.setPreference(snapshot.settings.general.theme);
      this.i18n.setLang(snapshot.settings.general.language);
      this.persistent.set(true);
    } catch {
      // Not running inside Tauri: keep the in-memory defaults with the current theme / language.
      this.state.update((s) => ({ ...s, general: { ...s.general, theme: this.theme.preference(), language: this.i18n.lang() } }));
    }
  }

  /** Applies `change` to the latest settings and saves them. Rejects with `DesktopIpcError` when saving fails. */
  update(change: (current: AppSettings) => AppSettings): Promise<AppSettings> {
    const run = async (): Promise<AppSettings> => {
      const next = change(this.state());
      const saved = this.persistent() ? await this.ipc.invoke<AppSettings>('settings_save', { settings: next }) : next;
      this.state.set(saved);
      return saved;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Native folder picker; resolves `null` when cancelled. */
  pickFolder(title: string, start: string | null): Promise<string | null> {
    return this.ipc.invoke<string | null>('settings_pick_folder', { title, start });
  }
}

/** Loads settings.json before the first screen renders. */
export function provideAppSettings(): EnvironmentProviders {
  return provideAppInitializer(() => inject(AppSettingsService).load());
}
