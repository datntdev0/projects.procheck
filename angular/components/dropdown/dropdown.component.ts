import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model } from '@angular/core';

export type DropdownPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

/**
 * Anchored popover. The projected element marked `pcDropdownTrigger` toggles it;
 * everything else is the panel (usually a `pc-menu`). Closes on outside click, Escape,
 * or when a `[pcMenuItem]` inside the panel is clicked.
 * ```html
 * <pc-dropdown placement="bottom-end">
 *   <button pcButton pcDropdownTrigger>Theme</button>
 *   <pc-menu>…</pc-menu>
 * </pc-dropdown>
 * ```
 */
@Component({
  selector: 'pc-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'dropdown',
    style: 'position: relative; display: inline-flex',
    '(document:mousedown)': 'onDocumentDown($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <span class="dropdown-trigger" (click)="toggle($event)"><ng-content select="[pcDropdownTrigger]" /></span>
    @if (open()) {
      <div class="dropdown-panel" [class.is-end]="isEnd()" [class.is-top]="isTop()" (click)="onPanelClick($event)">
        <ng-content />
      </div>
    }
  `,
  styles: `
    .dropdown-trigger { display: inline-flex; }
    .dropdown-panel { position: absolute; top: calc(100% + 6px); left: 0; z-index: var(--z-dropdown); text-align: start; animation: popIn var(--dur-base) var(--ease-out); }
    .dropdown-panel.is-end { left: auto; right: 0; }
    .dropdown-panel.is-top { top: auto; bottom: calc(100% + 6px); }
    .dropdown-panel > .menu { box-shadow: var(--shadow-lg); }
  `,
})
export class DropdownComponent {
  readonly placement = input<DropdownPlacement>('bottom-start');
  readonly open = model(false);

  protected readonly isEnd = computed(() => this.placement().endsWith('end'));
  protected readonly isTop = computed(() => this.placement().startsWith('top'));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected toggle(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('[pcDropdownTrigger]')) this.open.update((v) => !v);
  }

  protected onPanelClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.menu-item')) this.open.set(false);
  }

  protected onDocumentDown(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }
}
