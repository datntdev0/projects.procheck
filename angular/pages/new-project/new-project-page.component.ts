import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { PageHeaderComponent } from '@components/page-header/page-header.component';
import { StepperComponent } from '@components/stepper/stepper.component';
import { ToastService } from '@components/toast/toast.service';
import { CreateProgress } from '@features/projects/projects.model';
import { ProjectsService } from '@features/projects/projects.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { CreateProgressDialogComponent } from './create-progress-dialog.component';
import { NewProjectForm, STEP_COUNT } from './new-project-form';
import { NewProjectSummaryComponent } from './new-project-summary.component';
import { AiStepComponent } from './steps/ai-step.component';
import { BasicsStepComponent } from './steps/basics-step.component';
import { PhaseStepComponent } from './steps/phase-step.component';
import { SourcesStepComponent } from './steps/sources-step.component';

const STEP_LABELS = ['np.s1', 'np.s2', 'np.s3', 'np.s4'] as const;

@Component({
  selector: 'pc-new-project-page',
  imports: [
    AiStepComponent,
    BasicsStepComponent,
    ButtonComponent,
    CreateProgressDialogComponent,
    IconComponent,
    NewProjectSummaryComponent,
    PageHeaderComponent,
    PhaseStepComponent,
    RouterLink,
    SourcesStepComponent,
    StepperComponent,
    TranslatePipe,
  ],
  providers: [NewProjectForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-project-page.component.html',
})
export class NewProjectPageComponent {
  protected readonly form = inject(NewProjectForm);
  private readonly projects = inject(ProjectsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly stepCount = STEP_COUNT;
  protected readonly stepLabels = computed(() => STEP_LABELS.map((key) => this.i18n.t(key)));
  protected readonly isLast = computed(() => this.form.step() === STEP_COUNT - 1);

  protected readonly creating = signal(false);
  protected readonly progress = signal<CreateProgress | null>(null);
  protected readonly createError = signal<string | null>(null);

  protected next(): void {
    void this.form.next();
  }

  protected async create(): Promise<void> {
    if (this.creating() || !(await this.form.allValid())) return;
    this.progress.set(null);
    this.createError.set(null);
    this.creating.set(true);
    try {
      const project = await this.projects.create(this.form.toInput(), (step) => this.progress.set(step));
      this.toast.show(this.i18n.t('np.cs.toast'));
      await this.router.navigate(['/projects', project.id, 'overview']);
    } catch (error) {
      console.error('Could not create the project', error);
      this.createError.set(error instanceof DesktopIpcError ? error.reason : String(error));
    }
  }

  protected closeDialog(): void {
    this.creating.set(false);
  }
}
