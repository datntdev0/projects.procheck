import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { IconComponent } from '@components/icon/icon.component';
import { MENU } from '@components/menu/menu.component';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';
import { ThemeService } from '@shared/theme/theme.service';

import { LayoutService } from '../layout.service';
import { MAIN_NAV, SETTINGS_NAV } from '../navigation';

interface SearchEntry {
  group: TranslationKey;
  label: TranslationKey;
  icon: string;
  run: () => void;
}

/** Command palette (Ctrl K): jump to pages and run shell actions. Content search comes later. */
@Component({
  selector: 'pc-search-dialog',
  imports: [IconComponent, TranslatePipe, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-dialog.component.html',
})
export class SearchDialogComponent {
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('queryInput');

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  private readonly entries: SearchEntry[] = [
    ...[...MAIN_NAV, SETTINGS_NAV].map((item) => ({
      group: 'pal.nav' as const,
      label: item.label,
      icon: item.icon,
      run: () => void this.router.navigateByUrl(item.route),
    })),
    { group: 'pal.actions', label: 'pal.toggleassistant', icon: 'sparkles', run: () => this.layout.toggleAssistant() },
    { group: 'pal.actions', label: 'pal.togglelang', icon: 'languages', run: () => this.i18n.toggle() },
    { group: 'pal.actions', label: 'pal.toggletheme', icon: 'sun-moon', run: () => this.theme.toggle() },
  ];

  protected readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.entries.filter((e) => this.i18n.t(e.label).toLowerCase().includes(q)) : this.entries;
  });

  constructor() {
    effect(() => {
      if (!this.layout.searchOpen()) return;
      this.query.set('');
      this.activeIndex.set(0);
      queueMicrotask(() => this.input()?.nativeElement.focus());
    });
  }

  protected close(): void {
    this.layout.searchOpen.set(false);
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.activeIndex.update((i) => (i + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.activeIndex.update((i) => (i - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = this.results()[this.activeIndex()];
      if (entry) this.select(entry);
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  protected select(entry: SearchEntry): void {
    this.close();
    entry.run();
  }

  protected isGroupStart(index: number): boolean {
    const list = this.results();
    return index === 0 || list[index - 1].group !== list[index].group;
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
