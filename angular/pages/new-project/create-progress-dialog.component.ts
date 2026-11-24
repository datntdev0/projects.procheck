import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';

import { AlertComponent } from '@components/alert/alert.component';
import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import { SpinnerComponent } from '@components/progress/progress.component';
import { CREATE_STEPS, CreateProgress, CreateStep } from '@features/projects/projects.model';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

type StepState = 'pending' | 'running' | 'done';

@Component({
  selector: 'pc-np-create-dialog',
  imports: [AlertComponent, ButtonComponent, DialogComponent, DialogFooterDirective, IconComponent, SpinnerComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-dialog [(open)]="open" [title]="(error() ? 'np.cs.failed' : 'np.cs.title') | t" [dismissible]="!!error()" width="min(480px, 100%)">
      <div data-testid="np-create-steps">
        @for (step of steps(); track step.id) {
          <div class="cstep" [class.is-run]="step.state === 'running'" [class.is-done]="step.state === 'done'">
            <span class="ci">
              @switch (step.state) {
                @case ('done') {
                  <pc-icon name="circle-check" [size]="18" />
                }
                @case ('running') {
                  @if (error()) {
                    <pc-icon name="circle-alert" [size]="18" class="text-danger" />
                  } @else {
                    <pc-spinner />
                  }
                }
                @default {
                  <i class="pend"></i>
                }
              }
            </span>
            <span>
              {{ 'np.cs.' + step.id | t }}
              @if (step.detail) {
                <small>{{ step.detail }}</small>
              }
            </span>
          </div>
        }
      </div>
      @if (error(); as message) {
        <pc-alert tone="danger" style="margin-top: 12px">{{ message }}</pc-alert>
      }
      @if (error()) {
        <div class="modal-footer" pcDialogFooter>
          <button pcButton (click)="closed.emit()">{{ 'np.cs.close' | t }}</button>
        </div>
      }
    </pc-dialog>
  `,
})
export class CreateProgressDialogComponent {
  private readonly i18n = inject(I18nService);

  readonly open = model(false);
  readonly progress = input<CreateProgress | null>(null);
  readonly sourceCount = input(0);
  readonly error = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly steps = computed(() => {
    const visible = CREATE_STEPS.filter((id) => id !== 'source' || this.sourceCount() > 0);
    const current = this.progress();
    const currentIndex = current ? visible.indexOf(current.step) : -1;
    return visible.map((id, index) => ({
      id,
      state: this.stateOf(index, currentIndex),
      detail: this.detailOf(id, current),
    }));
  });

  private stateOf(index: number, currentIndex: number): StepState {
    if (index < currentIndex) return 'done';
    return index === currentIndex ? 'running' : 'pending';
  }

  private detailOf(id: CreateStep, current: CreateProgress | null): string {
    if (id !== 'source' || current?.step !== 'source') return '';
    return this.i18n.t('np.cs.source.n', { i: current.index + 1, n: current.total, name: current.name });
  }
}
