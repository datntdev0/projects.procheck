import { Directive, input } from '@angular/core';

export type TooltipPosition = 'top' | 'bottom' | 'right';

/**
 * CSS-only tooltip: `<button pcTooltip="Search">`. Also sets `aria-label`, so icon-only
 * buttons get an accessible name. Use `bottom` in the topbar and `right` in the sidebar.
 */
@Directive({
  selector: '[pcTooltip]',
  host: {
    '[attr.data-tip]': "position() === 'top' ? pcTooltip() || null : null",
    '[attr.data-tip-bottom]': "position() === 'bottom' ? pcTooltip() || null : null",
    '[attr.data-tip-right]': "position() === 'right' ? pcTooltip() || null : null",
    '[attr.aria-label]': 'pcTooltip() || null',
  },
})
export class TooltipDirective {
  readonly pcTooltip = input<string>('');
  readonly tooltipPosition = input<TooltipPosition>('top');
  protected readonly position = this.tooltipPosition;
}
