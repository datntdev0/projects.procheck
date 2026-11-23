import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { IconComponent } from '@components/icon/icon.component';

import {
  AGENTS,
  BLUE_STEPS,
  CONTRAST_PAIRS,
  CURRENT_PROJECT,
  DEMO_PROJECT,
  DEMO_TOASTS,
  GRAY_STEPS,
  ICON_GROUPS,
  MAP_TOKENS,
  PALETTE_ITEMS,
  PHASE_LABEL,
  PROJECTS,
  SEMANTIC_TOKENS,
  STORAGE_CARDS,
  SWATCH_GROUPS,
  SWATCH_TOKENS,
  TOC,
  type Swatch,
  type ToastTone,
} from './overview-data';
import { SNIPPETS } from './overview-snippets';

type ThemePref = 'system' | 'light' | 'dark';
type Rgba = readonly [number, number, number, number];

interface ScaleStep { readonly step: number; readonly value: string; }
interface MapRow { readonly token: string; readonly light: string; readonly dark: string; }
interface ContrastRow {
  readonly fg: string;
  readonly bg: string;
  readonly ratio: string;
  readonly level: string;
  readonly tone: 'success' | 'warning' | 'danger';
}
interface Toast { readonly id: number; readonly message: string; readonly icon: string; readonly color: string; readonly leaving: boolean; }

const TOAST_COLOR: Readonly<Record<ToastTone, string>> = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
};

/**
 * Storybook port of `_proto/DESIGN.html` — the Procheck design-system reference page.
 * Uses the global prototype classes (styles.scss); page-level doc styles live in the
 * component stylesheet, scoped under `.ds-page`.
 */
@Component({
  selector: 'pc-design-overview',
  imports: [IconComponent, NgTemplateOutlet],
  templateUrl: './design-overview.component.html',
  styleUrl: './design-overview.component.scss',
  encapsulation: ViewEncapsulation.None,
  // Keep inter-element spaces (e.g. `<span>Procheck</span> <span>Design System</span>`) as in the HTML source.
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class DesignOverviewComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly toc = TOC;
  protected readonly snippets = SNIPPETS;
  protected readonly swatchGroups = SWATCH_GROUPS;
  protected readonly iconGroups = ICON_GROUPS;
  protected readonly projects = PROJECTS;
  protected readonly switcherProject = DEMO_PROJECT;
  protected readonly phaseLabel = PHASE_LABEL;
  protected readonly agents = AGENTS;
  protected readonly storageCards = STORAGE_CARDS;
  protected readonly runWorktree = CURRENT_PROJECT.dir + '\\.procheck\\worktrees\\lp-142';
  protected readonly segModes = ['Ask', 'Edit', 'Agent'] as const;
  protected readonly demoTabs = [
    { label: 'Artifacts', count: 18 },
    { label: 'Sources', count: 7 },
    { label: 'History', count: 0 },
    { label: 'Export', count: 0 },
  ] as const;

  // ---- UI state
  protected readonly themePref = signal<ThemePref>('light');
  protected readonly activeSection = signal<string>(TOC[0].id);
  protected readonly segMode = signal<string>('Ask');
  protected readonly activeTab = signal<string>('Artifacts');
  protected readonly dropOver = signal(false);
  protected readonly switcherOpen = signal(true);
  protected readonly modalOpen = signal(false);
  protected readonly paletteOpen = signal(false);
  protected readonly paletteQuery = signal('');
  protected readonly paletteActive = signal(0);
  protected readonly toasts = signal<readonly Toast[]>([]);

  protected readonly paletteItems = computed(() => {
    const q = this.paletteQuery().toLowerCase();
    return PALETTE_ITEMS.filter((i) => i.label.toLowerCase().includes(q));
  });

  // ---- live token readouts (filled in the browser after first render)
  protected readonly blueScale = signal<readonly ScaleStep[]>(BLUE_STEPS.map((step) => ({ step, value: '' })));
  protected readonly grayScale = signal<readonly ScaleStep[]>(GRAY_STEPS.map((step) => ({ step, value: '' })));
  protected readonly tokenValues = signal<Readonly<Record<string, string>>>({});
  protected readonly tokenMap = signal<readonly MapRow[]>([]);
  protected readonly contrastRows = signal<readonly ContrastRow[]>([]);

  private readonly tpLight = viewChild.required<ElementRef<HTMLElement>>('tpLight');
  private readonly tpDark = viewChild.required<ElementRef<HTMLElement>>('tpDark');
  private readonly paletteInput = viewChild<ElementRef<HTMLInputElement>>('paletteInput');

  private toastSeq = 0;
  private probe?: HTMLSpanElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const root = document.documentElement;
      this.themePref.set(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
      this.buildScales();
      this.buildCompare();
      this.refreshLive();
      this.onScroll();

      // Storybook toolbar (or our own controls) switch `data-theme` on <html>: re-read live values.
      const observer = new MutationObserver(() => {
        if (this.themePref() !== 'system') this.themePref.set(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
        this.refreshLive();
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
      destroyRef.onDestroy(() => {
        observer.disconnect();
        this.probe?.remove();
      });
    });
  }

  // ------------------------------------------------------------------ theme
  protected setTheme(pref: ThemePref): void {
    this.themePref.set(pref);
    const resolved = pref === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  // ------------------------------------------------------------- navigation
  protected scrollTo(event: Event, id: string): void {
    event.preventDefault();
    this.host.nativeElement.querySelector<HTMLElement>('#' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    const el = this.host.nativeElement;
    const secs = Array.from(el.querySelectorAll<HTMLElement>('.ds-sec'));
    let cur = secs[0]?.id ?? '';
    for (const s of secs) if (s.getBoundingClientRect().top <= 140) cur = s.id;
    if (cur !== this.activeSection()) {
      this.activeSection.set(cur);
      // Narrow layout: the TOC is a horizontal strip — keep the active link in view.
      const toc = el.querySelector<HTMLElement>('.ds-toc');
      const link = toc?.querySelector<HTMLElement>(`a[href="#${cur}"]`);
      if (toc && link && toc.scrollWidth > toc.clientWidth && toc.clientWidth) {
        toc.scrollTo({ left: link.offsetLeft - 24, behavior: 'smooth' });
      }
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.openPalette();
    } else if (e.key === 'Escape') {
      this.modalOpen.set(false);
      this.paletteOpen.set(false);
    }
  }

  // --------------------------------------------------------- copy & toasts
  protected copySnippet(event: Event, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.copy(this.snippets[index], 'Copied');
  }

  protected copyIcon(name: string): void {
    this.copy(name, 'Copied · ' + name);
  }

  private copy(text: string, message: string): void {
    try {
      navigator.clipboard?.writeText(text).catch(() => undefined);
    } catch {
      /* clipboard unavailable */
    }
    this.toast(message);
  }

  protected demoToast(tone?: ToastTone): void {
    const t = DEMO_TOASTS[tone ?? 'default'];
    this.toast(t.message, { tone, icon: t.icon });
  }

  protected toast(message: string, opts: { tone?: ToastTone; icon?: string } = {}): void {
    const id = ++this.toastSeq;
    const color = opts.tone ? TOAST_COLOR[opts.tone] : 'var(--kms-sky)';
    this.toasts.update((list) => [...list, { id, message, icon: opts.icon ?? 'circle-check', color, leaving: false }]);
    setTimeout(() => {
      this.toasts.update((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), 300);
    }, 2800);
  }

  // -------------------------------------------------------- modal & palette
  protected openModal(): void {
    this.modalOpen.set(true);
  }

  protected promote(): void {
    this.modalOpen.set(false);
    this.toast('Pull request #214 opened', { tone: 'success' });
  }

  protected onOverlayClick(event: MouseEvent, which: 'modal' | 'palette'): void {
    if (event.target !== event.currentTarget) return;
    if (which === 'modal') this.modalOpen.set(false);
    else this.paletteOpen.set(false);
  }

  protected openPalette(): void {
    this.paletteQuery.set('');
    this.paletteActive.set(0);
    this.paletteOpen.set(true);
    setTimeout(() => this.paletteInput()?.nativeElement.focus());
  }

  protected onPaletteInput(event: Event): void {
    this.paletteQuery.set((event.target as HTMLInputElement).value);
    this.paletteActive.set(0);
  }

  protected onPaletteKey(e: KeyboardEvent): void {
    const last = Math.max(0, this.paletteItems().length - 1);
    if (e.key === 'ArrowDown') {
      this.paletteActive.update((n) => Math.min(last, n + 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      this.paletteActive.update((n) => Math.max(0, n - 1));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      this.pickPalette(this.paletteActive());
      e.preventDefault();
    }
  }

  /** Navigation targets are prototype pages, so in Storybook picking an item just closes the palette. */
  protected pickPalette(index: number): void {
    const item = this.paletteItems()[index];
    if (!item) return;
    if (item.action === 'theme') this.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    this.paletteOpen.set(false);
  }

  // ---------------------------------------------------------------- dropzone
  protected onDrag(event: DragEvent, over: boolean): void {
    event.preventDefault();
    this.dropOver.set(over);
  }

  // ------------------------------------------------------------ template helpers
  protected asSwatches(group: unknown): readonly Swatch[] {
    return group as readonly Swatch[];
  }

  // ------------------------------------------------------------- live tokens
  private buildScales(): void {
    const cs = getComputedStyle(document.documentElement);
    const read = (prefix: string, step: number) => cs.getPropertyValue(`--${prefix}-${step}`).trim().toUpperCase();
    this.blueScale.set(BLUE_STEPS.map((step) => ({ step, value: read('blue', step) })));
    this.grayScale.set(GRAY_STEPS.map((step) => ({ step, value: read('gray', step) })));
  }

  /** Reads token values for both themes and pins them on the comparison panels. */
  private buildCompare(): void {
    const light = this.readTheme('light', SEMANTIC_TOKENS);
    const dark = this.readTheme('dark', SEMANTIC_TOKENS);
    const panels: readonly [HTMLElement, readonly string[], string][] = [
      [this.tpLight().nativeElement, light, 'light'],
      [this.tpDark().nativeElement, dark, 'dark'],
    ];
    for (const [el, values, scheme] of panels) {
      SEMANTIC_TOKENS.forEach((n, i) => el.style.setProperty('--' + n, values[i]));
      el.style.colorScheme = scheme;
    }
    this.tokenMap.set(
      MAP_TOKENS.map((token) => {
        const i = SEMANTIC_TOKENS.indexOf(token);
        return { token, light: light[i], dark: dark[i] };
      }),
    );
  }

  private readTheme(theme: 'light' | 'dark', names: readonly string[]): string[] {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    const st = document.createElement('style');
    st.textContent = '*,*::before,*::after{transition:none!important}';
    document.head.appendChild(st);
    root.setAttribute('data-theme', theme);
    const cs = getComputedStyle(root);
    const out = names.map((n) => cs.getPropertyValue('--' + n).replace(/\s+/g, ' ').trim());
    if (prev === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prev);
    getComputedStyle(root).getPropertyValue('--brand');
    st.remove();
    return out;
  }

  /** Values that follow the current theme: swatch readouts and the contrast table. */
  private refreshLive(): void {
    const cs = getComputedStyle(document.documentElement);
    const values: Record<string, string> = {};
    for (const t of SWATCH_TOKENS) values[t] = cs.getPropertyValue('--' + t).replace(/\s+/g, ' ').trim();
    this.tokenValues.set(values);
    this.buildContrast();
  }

  private buildContrast(): void {
    const canvas = this.colorOf('bg-canvas', 'backgroundColor');
    const base: Rgba = [canvas[0], canvas[1], canvas[2], 1];
    this.contrastRows.set(
      CONTRAST_PAIRS.map(([fgTok, bgTok]) => {
        const bg = over(this.colorOf(bgTok, 'backgroundColor'), base);
        const fg = over(this.colorOf(fgTok, 'color'), bg);
        const r = ratio(fg, bg);
        const [level, tone] =
          r >= 7 ? (['AAA', 'success'] as const) : r >= 4.5 ? (['AA', 'success'] as const) : r >= 3 ? (['AA Large', 'warning'] as const) : (['Fail', 'danger'] as const);
        return { fg: fgTok, bg: bgTok, ratio: r.toFixed(2), level, tone };
      }),
    );
  }

  private colorOf(token: string, prop: 'color' | 'backgroundColor'): Rgba {
    if (!this.probe) {
      this.probe = document.createElement('span');
      this.probe.setAttribute('aria-hidden', 'true');
      this.probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;transition:none';
      this.host.nativeElement.appendChild(this.probe);
    }
    this.probe.style.color = '';
    this.probe.style.backgroundColor = '';
    this.probe.style[prop] = `var(--${token})`;
    return parseColor(getComputedStyle(this.probe)[prop]);
  }
}

/** Parses `rgb()/rgba()` and `color(srgb …)` computed values to 0–255 channels + alpha. */
function parseColor(value: string): Rgba {
  const m = (value.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
  const scale = value.startsWith('color(') ? 255 : 1;
  return [m[0] * scale, m[1] * scale, m[2] * scale, m[3] ?? 1];
}

function over(c: Rgba, base: Rgba): Rgba {
  return [0, 1, 2].map((i) => c[i] * c[3] + base[i] * (1 - c[3])).concat(1) as unknown as Rgba;
}

function luminance(c: Rgba): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function ratio(a: Rgba, b: Rgba): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
