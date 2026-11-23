import { ChangeDetectionStrategy, Component, Directive, input, model } from '@angular/core';

import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';

/** Marks the projected footer (actions) of a `pc-dialog`. */
@Directive({ selector: '[pcDialogFooter]' })
export class DialogFooterDirective {}

/**
 * Modal dialog over a blurred overlay. Two-way bind `[(open)]`.
 * Closes on Escape and backdrop click unless `dismissible` is false.
 */
@Component({
  selector: 'pc-dialog',
  imports: [ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'dismiss()' },
  template: `
    @if (open()) {
      <div class="overlay" (mousedown)="onBackdrop($event)">
        <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="title()" [style.width]="width()">
          @if (title()) {
            <div class="modal-header">
              <h4>{{ title() }}</h4>
              <button pcButton variant="ghost" size="sm" [iconOnly]="true" aria-label="Close" (click)="open.set(false)">
                <pc-icon name="x" />
              </button>
            </div>
          }
          <div class="modal-body"><ng-content /></div>
          <ng-content select="[pcDialogFooter]" />
        </div>
      </div>
    }
  `,
})
export class DialogComponent {
  readonly open = model(false);
  readonly title = input('');
  readonly width = input('min(560px, 100%)');
  readonly dismissible = input(true);

  protected dismiss(): void {
    if (this.open() && this.dismissible()) this.open.set(false);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.dismiss();
  }
}
