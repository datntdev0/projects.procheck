import { DestroyRef, ElementRef, Signal, WritableSignal, afterNextRender, inject, signal } from '@angular/core';

/** Offset (px) below the top of the canvas at which a section counts as the current one. */
const SPY_OFFSET = 90;

/**
 * In-page navigation of a settings page: scrolls to a `[data-sec]` section and tracks which one
 * is current while the canvas scrolls. Create it in a field initializer of the page component.
 */
export class SectionSpy<T extends string> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ids: readonly T[];
  private readonly current: WritableSignal<T>;
  readonly active: Signal<T>;

  constructor(ids: readonly T[]) {
    this.ids = ids;
    this.current = signal(ids[0]);
    this.active = this.current.asReadonly();
    afterNextRender(() => this.watch());
  }

  go(id: T): void {
    this.section(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.current.set(id);
  }

  private watch(): void {
    const canvas = this.host.nativeElement.closest<HTMLElement>('.canvas');
    if (!canvas) return;
    const onScroll = () => this.spy(canvas);
    canvas.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => canvas.removeEventListener('scroll', onScroll));
    this.spy(canvas);
  }

  private section(id: T): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(`[data-sec="${id}"]`);
  }

  /** Marks the last section whose top has scrolled past the offset; the bottom of the page selects the last one. */
  private spy(canvas: HTMLElement): void {
    const top = canvas.getBoundingClientRect().top + SPY_OFFSET;
    let current = this.ids[0];
    for (const id of this.ids) {
      const el = this.section(id);
      if (el && el.getBoundingClientRect().top <= top) current = id;
    }
    if (canvas.scrollTop + canvas.clientHeight >= canvas.scrollHeight - 4) {
      current = this.ids[this.ids.length - 1];
    }
    this.current.set(current);
  }
}
