import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AlertComponent } from '@components/alert/alert.component';
import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { ReadyProjectItem } from '@features/projects/projects.model';
import { ProjectsService } from '@features/projects/projects.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SETTINGS_SECTION } from '../../settings/settings-section.component';

/** Danger zone: remove the project from the list (files kept) or delete its directory (typed confirmation). */
@Component({
  selector: 'pc-project-danger-section',
  imports: [AlertComponent, ButtonComponent, DialogComponent, DialogFooterDirective, IconComponent, InputDirective, TranslatePipe, ...SETTINGS_SECTION],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-settings-section class="is-danger" sectionId="danger" [title]="'ps.n.danger' | t" [description]="'ps.danger.d' | t">
      <pc-setting-row [label]="'ps.d.remove' | t" [description]="'ps.d.remove.d' | t">
        <button pcButton type="button" data-testid="ps-remove" (click)="removeOpen.set(true)">
          <pc-icon name="list-x" />{{ 'ps.d.remove.btn' | t }}
        </button>
      </pc-setting-row>
      <pc-setting-row class="is-danger" [label]="'ps.d.delete' | t" [description]="'ps.d.delete.d' | t">
        <button pcButton variant="danger" type="button" data-testid="ps-delete" (click)="openDelete()">
          <pc-icon name="trash-2" />{{ 'ps.d.delete.btn' | t }}
        </button>
      </pc-setting-row>
    </pc-settings-section>

    <pc-dialog [(open)]="removeOpen" [title]="'ps.d.remove.t' | t: { n: name() }" width="min(480px, 100%)" [dismissible]="!busy()">
      <p class="text-sm text-muted" style="margin: 0">{{ 'ps.d.remove.td' | t: { p: project().dir } }}</p>
      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" type="button" [disabled]="busy()" (click)="removeOpen.set(false)">{{ 'common.cancel' | t }}</button>
        <button pcButton variant="danger" type="button" data-testid="ps-remove-confirm" [disabled]="busy()" (click)="remove()">
          <pc-icon name="list-x" />{{ 'ps.d.remove.btn' | t }}
        </button>
      </div>
    </pc-dialog>

    <pc-dialog [(open)]="deleteOpen" [title]="'ps.d.delete.t' | t" width="min(500px, 100%)" [dismissible]="!busy()">
      <pc-alert tone="danger" icon="triangle-alert">{{ 'ps.d.delete.td' | t: { p: project().dir, n: name() } }}</pc-alert>
      <input
        pcInput
        class="delete-confirm"
        autocomplete="off"
        spellcheck="false"
        data-testid="ps-delete-input"
        [placeholder]="name()"
        [value]="confirmText()"
        (input)="confirmText.set($any($event.target).value)"
      />
      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" type="button" [disabled]="busy()" (click)="deleteOpen.set(false)">{{ 'common.cancel' | t }}</button>
        <button pcButton variant="danger" type="button" data-testid="ps-delete-confirm" [disabled]="!deleteConfirmed() || busy()" (click)="delete()">
          <pc-icon name="trash-2" />{{ 'ps.d.delete.confirm' | t }}
        </button>
      </div>
    </pc-dialog>
  `,
})
export class ProjectDangerSectionComponent {
  readonly project = input.required<ReadyProjectItem>();

  private readonly projects = inject(ProjectsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly removeOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly confirmText = signal('');
  protected readonly busy = signal(false);

  protected readonly name = computed(() => this.project().manifest.name);
  protected readonly deleteConfirmed = computed(() => this.confirmText().trim() === this.name());

  protected openDelete(): void {
    this.confirmText.set('');
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    await this.run(() => this.projects.remove(this.project().id), 'ps.d.removed', 'list-x');
  }

  protected async delete(): Promise<void> {
    if (this.deleteConfirmed()) await this.run(() => this.projects.delete(this.project().id), 'ps.d.deleted', 'trash-2');
  }

  private async run(action: () => Promise<void>, done: 'ps.d.removed' | 'ps.d.deleted', icon: string): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.removeOpen.set(false);
      this.deleteOpen.set(false);
      this.toast.show(this.i18n.t(done), { icon });
      await this.router.navigate(['/projects']);
    } catch (error) {
      const reason = error instanceof DesktopIpcError ? error.reason : String(error);
      this.toast.show(this.i18n.t('ps.d.failed', { reason }), { icon: 'circle-alert', tone: 'danger', duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }
}
