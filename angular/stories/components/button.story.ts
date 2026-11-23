import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';

const meta: Meta<ButtonComponent> = {
  title: 'DESIGN SYSTEM/Components/Button',
  component: ButtonComponent,
  decorators: [moduleMetadata({ imports: [ButtonComponent, IconComponent] })],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'soft', 'danger', 'ai'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
  args: { variant: 'primary', size: 'md', iconOnly: false, block: false },
  render: (args) => ({
    props: args,
    template: `<button pcButton [variant]="variant" [size]="size" [block]="block">Create project</button>`,
  }),
};
export default meta;
type Story = StoryObj<ButtonComponent>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => ({
    template: `
      <div class="row wrap gap-3">
        <button pcButton variant="primary"><pc-icon name="plus" /> Primary</button>
        <button pcButton variant="secondary">Secondary</button>
        <button pcButton variant="soft">Soft</button>
        <button pcButton variant="ghost">Ghost</button>
        <button pcButton variant="danger">Danger</button>
        <button pcButton variant="ai"><pc-icon name="sparkles" /> Ask Assistant</button>
        <button pcButton variant="primary" disabled>Disabled</button>
      </div>`,
  }),
};

export const Sizes: Story = {
  render: () => ({
    template: `
      <div class="row gap-3">
        <button pcButton variant="primary" size="sm">Small</button>
        <button pcButton variant="primary">Medium</button>
        <button pcButton variant="primary" size="lg">Large</button>
        <button pcButton variant="ghost" size="sm" [iconOnly]="true" aria-label="Settings"><pc-icon name="settings" /></button>
        <button pcButton variant="secondary" [iconOnly]="true" aria-label="Search"><pc-icon name="search" /></button>
      </div>`,
  }),
};
