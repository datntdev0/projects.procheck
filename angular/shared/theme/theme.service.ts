import {
  DOCUMENT,
  DestroyRef,
  EnvironmentProviders,
  Injectable,
  computed,
  effect,
  inject,
  provideAppInitializer,
  signal,
} from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

/** Keep in sync with the pre-paint script in index.html. */
const STORAGE_KEY = 'pc.theme';

function readStoredPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Theme provider. Follows the OS by default; Light / Dark override it and are persisted.
 * Writes `data-theme="light|dark"` (drives the tokens) and `data-theme-pref` on <html>.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly preference = signal<ThemePreference>(readStoredPreference());
  private readonly systemDark = signal(false);
  readonly theme = computed<Theme>(() => {
    const pref = this.preference();
    return pref === 'system' ? (this.systemDark() ? 'dark' : 'light') : pref;
  });

  constructor() {
    const media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (media) {
      this.systemDark.set(media.matches);
      const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
      media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
    }

    effect(() => {
      const root = this.document.documentElement;
      root.setAttribute('data-theme', this.theme());
      root.setAttribute('data-theme-pref', this.preference());
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Storage unavailable: preference lasts for this session only.
    }
  }

  /** Flip between light and dark (leaves "system"). */
  toggle(): void {
    this.setPreference(this.theme() === 'dark' ? 'light' : 'dark');
  }
}

/** Starts the theme provider with the app so the stored / OS theme applies immediately. */
export function provideTheme(): EnvironmentProviders {
  return provideAppInitializer(() => {
    inject(ThemeService);
  });
}

/** Icon for a theme preference. */
export function themeIcon(preference: ThemePreference): string {
  return preference === 'system' ? 'monitor' : preference === 'dark' ? 'moon' : 'sun';
}
