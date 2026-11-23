import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

import { type TranslationKey, type Translations, en } from './locales/en';
import { vi } from './locales/vi';

export type Lang = 'en' | 'vi';
export const LANGS: Lang[] = ['en', 'vi'];

const STORAGE_KEY = 'pc.lang';
const DICTIONARIES: Record<Lang, Translations> = { en, vi };

function readStoredLang(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'vi' || value === 'en' ? value : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Bilingual (EN / VI) UI strings. The current language is a signal, so templates
 * using the `t` pipe and `computed()`s calling `t()` update when it changes.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);

  readonly lang = signal<Lang>(readStoredLang());
  private readonly dict = computed(() => DICTIONARIES[this.lang()]);

  constructor() {
    effect(() => {
      const lang = this.lang();
      this.document.documentElement.lang = lang;
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // Storage unavailable: language lasts for this session only.
      }
    });
  }

  /** Translate `key`, replacing `{name}` placeholders from `params`. Unknown keys fall back to English, then the key. */
  t(key: TranslationKey | string, params?: Record<string, string | number>): string {
    const text = this.dict()[key as TranslationKey] ?? en[key as TranslationKey] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : text;
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
  }

  toggle(): void {
    this.lang.update((l) => (l === 'en' ? 'vi' : 'en'));
  }
}
