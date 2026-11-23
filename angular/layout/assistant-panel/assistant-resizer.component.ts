import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';

import { ASSISTANT_MAX_W, ASSISTANT_MIN_W, LayoutService } from '../layout.service';

const KEY_STEP = 16;

/**
 * Drag handle on the left edge of the assistant panel. Drag (or ←/→ when focused) to resize,
 * double-click to reset to the default width. The width is persisted by {@link LayoutService}.
 */
@Component({
  selector: 'pc-assistant-resizer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'as-resizer',
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    'aria-label': 'Resize assistant panel',
    '[attr.aria-valuemin]': 'min',
    '[attr.aria-valuemax]': 'max',
    '[attr.aria-valuenow]': 'layout.assistantWidth()',
    'data-testid': 'assistant-resizer',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerEnd($event)',
    '(pointercancel)': 'onPointerEnd($event)',
    '(lostpointercapture)': 'onPointerEnd($event)',
    '(dblclick)': 'layout.setAssistantWidth(null)',
    '(keydown)': 'onKeydown($event)',
  },
  template: '',
})
export class AssistantResizerComponent {
  protected readonly layout = inject(LayoutService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly min = ASSISTANT_MIN_W;
  protected readonly max = ASSISTANT_MAX_W;

  private drag: { pointerId: number; startX: number; startWidth: number } | null = null;

  /** Rendered width of the panel: CSS may cap the stored width on narrow windows. */
  private currentWidth(): number {
    const panel = this.host.nativeElement.parentElement;
    return panel ? Math.round(panel.getBoundingClientRect().width) : (this.layout.assistantWidth() ?? ASSISTANT_MIN_W);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: this.currentWidth() };
    this.layout.assistantResizing.set(true);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    // The handle sits on the panel's left edge: dragging left widens the panel.
    this.layout.setAssistantWidth(this.drag.startWidth + this.drag.startX - event.clientX);
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = null;
    this.layout.assistantResizing.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const width = this.currentWidth();
    const next =
      event.key === 'ArrowLeft' ? width + KEY_STEP
      : event.key === 'ArrowRight' ? width - KEY_STEP
      : event.key === 'Home' ? ASSISTANT_MIN_W
      : event.key === 'End' ? ASSISTANT_MAX_W
      : null;
    if (next === null) return;
    event.preventDefault();
    this.layout.setAssistantWidth(next);
  }
}
