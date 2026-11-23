import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { BadgeComponent } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { CARD, CardComponent } from '@components/card/card.component';
import { StatComponent } from '@components/stat/stat.component';

const meta: Meta<CardComponent> = {
  title: 'DESIGN SYSTEM/Components/Card',
  component: CardComponent,
  decorators: [moduleMetadata({ imports: [...CARD, ButtonComponent, BadgeComponent, StatComponent] })],
  args: { padded: true, interactive: false, flat: false, accent: '' },
  render: (args) => ({
    props: args,
    template: `
      <pc-card [padded]="padded" [interactive]="interactive" [flat]="flat" [accent]="accent" style="max-width: 360px">
        <h4>Lotus Pay — Merchant Portal</h4>
        <p class="text-sm text-muted" style="margin: 4px 0 0">Sprint 4 · LP-142 in human review</p>
      </pc-card>`,
  }),
};
export default meta;
type Story = StoryObj<CardComponent>;

export const Playground: Story = {};

export const WithSections: Story = {
  render: () => ({
    template: `
      <pc-card style="max-width: 440px">
        <pc-card-header><h5>Business requirements</h5><pc-badge tone="warning">In review</pc-badge></pc-card-header>
        <pc-card-body><p class="text-sm text-muted" style="margin: 0">BRD v1 generated from 3 meetings and 5 sources. 2 blocking questions remain.</p></pc-card-body>
        <pc-card-footer><button pcButton variant="ghost" size="sm">Later</button><button pcButton variant="primary" size="sm">Review</button></pc-card-footer>
      </pc-card>`,
  }),
};

export const Stats: Story = {
  render: () => ({
    template: `
      <div class="grid grid-4">
        <pc-card [padded]="true"><pc-stat label="Active projects" value="5" delta="+1 this week" trend="up" /></pc-card>
        <pc-card [padded]="true"><pc-stat label="Waiting for you" value="7" /></pc-card>
        <pc-card [padded]="true" accent="var(--accent-teal)"><pc-stat label="Agent runs" value="3" delta="1 failed" trend="down" /></pc-card>
        <pc-card [padded]="true" [interactive]="true"><pc-stat label="Artifacts" value="42" /></pc-card>
      </div>`,
  }),
};
