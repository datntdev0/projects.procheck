import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { IconComponent } from '../icon/icon.component';
import { ToastService, ToastTone } from './toast.service';

const TONE_COLOR: Record<ToastTone, string | null> = {
  default: null,
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

@Component({
  selector: 'pc-toast-stack',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'toast-stack', 'aria-live': 'polite' },
  template: `
    @for (toast of toasts(); track toast.id) {
      <div class="toast" role="status">
        <pc-icon [name]="toast.icon" [style.color]="color[toast.tone]" />
        <span class="grow">{{ toast.message }}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-icon" style="color: inherit" aria-label="Dismiss" (click)="dismiss(toast.id)">
          <pc-icon name="x" [size]="14" />
        </button>
      </div>
    }
  `,
})
export class ToastStackComponent {
  private readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;
  protected readonly color = TONE_COLOR;

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }
}
