import { Component, inject } from '@angular/core';
import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { AlertComponent } from '@components/alert/alert.component';
import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';
import { ProgressComponent, SkeletonComponent, SpinnerComponent } from '@components/progress/progress.component';
import { ToastStackComponent } from '@components/toast/toast-stack.component';
import { ToastService } from '@components/toast/toast.service';

@Component({
  selector: 'pc-toast-demo',
  imports: [ButtonComponent, ToastStackComponent],
  template: `
    <div class="row gap-2">
      <button pcButton variant="primary" (click)="toast.show('Project saved')">Show toast</button>
      <button pcButton (click)="toast.show('Agent run failed · 6/9 e2e', { icon: 'circle-alert', tone: 'danger' })">Danger toast</button>
    </div>
    <pc-toast-stack />
  `,
})
class ToastDemoComponent {
  protected readonly toast = inject(ToastService);
}

const meta: Meta = {
  title: 'DESIGN SYSTEM/Components/Feedback',
  decorators: [
    moduleMetadata({
      imports: [AlertComponent, ButtonComponent, EmptyStateComponent, IconComponent, ProgressComponent, SpinnerComponent, SkeletonComponent, ToastDemoComponent],
    }),
  ],
};
export default meta;
type Story = StoryObj;

export const Alerts: Story = {
  render: () => ({
    template: `
      <div class="col gap-3" style="max-width: 640px">
        <pc-alert tone="info" title="CLI runs in an isolated HOME">Procheck points HOME to the project's .procheck/home folder.</pc-alert>
        <pc-alert tone="success">All 12 e2e checks passed.</pc-alert>
        <pc-alert tone="warning" title="2 blocking questions">Answer them before the scope can be finalized.</pc-alert>
        <pc-alert tone="danger" title="Agent run failed">6 of 9 e2e checks failed in the worktree.</pc-alert>
        <pc-alert tone="ai" title="Assistant suggestion">Draft user stories from the latest meeting transcript.
          <button pcAlertActions pcButton variant="ai" size="sm"><pc-icon name="sparkles" /> Draft</button>
        </pc-alert>
      </div>`,
  }),
};

export const Progress: Story = {
  render: () => ({
    template: `
      <div class="col gap-4" style="max-width: 420px">
        <pc-progress [value]="35" />
        <pc-progress [value]="68" [ai]="true" />
        <pc-progress [value]="90" color="var(--phase-sdlc)" />
        <div class="row gap-3"><pc-spinner /><span class="text-sm text-muted">Indexing sources…</span></div>
        <div class="col gap-2"><pc-skeleton width="60%" height="14px" /><pc-skeleton /><pc-skeleton width="80%" /></div>
      </div>`,
  }),
};

export const EmptyState: Story = {
  render: () => ({
    template: `
      <pc-empty-state icon="folder-plus" title="No projects yet" description="Create a project from documents, a meeting transcript or an existing repository.">
        <button pcButton variant="primary"><pc-icon name="plus" /> New project</button>
        <button pcButton>Open folder</button>
      </pc-empty-state>`,
  }),
};

export const Toast: Story = {
  render: () => ({ template: `<pc-toast-demo />` }),
};
