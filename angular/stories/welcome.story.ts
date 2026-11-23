import type { Meta, StoryObj } from '@storybook/angular-vite';

import { RootComponent } from '../root.component';

const meta: Meta<RootComponent> = {
  title: 'Pages/Welcome',
  component: RootComponent,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<RootComponent>;

export const Welcome: Story = {};
