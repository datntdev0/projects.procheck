import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';

import { DesignOverviewComponent } from './design-overview.component';
import { provideOverviewIcons } from './overview-icons';

const meta: Meta<DesignOverviewComponent> = {
  title: 'DESIGN SYSTEM/_Foundation',
  component: DesignOverviewComponent,
  parameters: { layout: 'fullscreen' },
  decorators: [applicationConfig({ providers: [provideOverviewIcons()] })],
};

export default meta;

type Story = StoryObj<DesignOverviewComponent>;

export const Overview: Story = {};
