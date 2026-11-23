import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from './i18n.service';
import type { TranslationKey } from './locales/en';

/**
 * `{{ 'nav.settings' | t }}` or `{{ 'soon.title' | t: { page: name } }}`.
 * Impure so it re-evaluates when the language signal changes; lookups are cheap.
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: TranslationKey | string | null | undefined, params?: Record<string, string | number>): string {
    return key ? this.i18n.t(key, params) : '';
  }
}
