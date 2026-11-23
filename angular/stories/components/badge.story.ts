import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { BadgeComponent } from '@components/badge/badge.component';
import { PhaseChipComponent } from '@components/badge/phase-chip.component';
import { StatusDotComponent } from '@components/badge/status-dot.component';
import { IconComponent } from '@components/icon/icon.component';

const meta: Meta<BadgeComponent> = {
  title: 'DESIGN SYSTEM/Components/Badge',
  component: BadgeComponent,
  decorators: [moduleMetadata({ imports: [BadgeComponent, PhaseChipComponent, StatusDotComponent, IconComponent] })],
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'brand', 'purple', 'teal', 'magenta', 'success', 'warning', 'danger', 'outline'] },
  },
  args: { tone: 'brand' },
  render: (args) => ({ props: args, template: `<pc-badge [tone]="tone">In review</pc-badge>` }),
};
export default meta;
type Story = StoryObj<BadgeComponent>;

export const Playground: Story = {};

export const Tones: Story = {
  render: () => ({
    template: `
      <div class="row wrap gap-2">
        <pc-badge>Neutral</pc-badge>
        <pc-badge tone="brand">Brand</pc-badge>
        <pc-badge tone="purple">Purple</pc-badge>
        <pc-badge tone="teal">Teal</pc-badge>
        <pc-badge tone="magenta">Magenta</pc-badge>
        <pc-badge tone="success"><pc-icon name="check" /> Passed</pc-badge>
        <pc-badge tone="warning">Needs review</pc-badge>
        <pc-badge tone="danger">Failed</pc-badge>
        <pc-badge tone="outline">Outline</pc-badge>
      </div>`,
  }),
};

export const PhaseChips: Story = {
  render: () => ({
    template: `
      <div class="row gap-2">
        <pc-phase-chip phase="initial">Initial</pc-phase-chip>
        <pc-phase-chip phase="release">Scaffolding</pc-phase-chip>
        <pc-phase-chip phase="sdlc">SDLC</pc-phase-chip>
      </div>`,
  }),
};

export const StatusDots: Story = {
  render: () => ({
    template: `
      <div class="row gap-4 text-sm">
        <span class="row"><pc-status-dot /> Idle</span>
        <span class="row"><pc-status-dot tone="brand" /> Running</span>
        <span class="row"><pc-status-dot tone="success" [pulse]="true" /> Connected</span>
        <span class="row"><pc-status-dot tone="warning" /> Waiting</span>
        <span class="row"><pc-status-dot tone="danger" /> Failed</span>
      </div>`,
  }),
};
