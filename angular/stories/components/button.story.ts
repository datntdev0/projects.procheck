import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';

const meta: Meta<ButtonComponent> = {
  title: 'DESIGN SYSTEM/Components/Button',
  component: ButtonComponent,
  decorators: [moduleMetadata({ imports: [ButtonComponent, IconComponent] })],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'soft', 'danger', 'ai', 'ai-primary'] },
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
        <button pcButton variant="primary" disabled>Disabled</button>
      </div>`,
  }),
};

/**
 * AI actions are not special-colored: `ai` is a secondary button with a brand sparkle.
 * Use `ai-primary` only when generating is the view's main action (one primary per view).
 */
export const AiActions: Story = {
  render: () => ({
    template: `
      <div class="col gap-5">
        <div>
          <div class="kicker" style="margin-bottom: 8px">AI is the main action — ai-primary</div>
          <div class="row wrap gap-3">
            <button pcButton><pc-icon name="upload" /> Upload</button>
            <button pcButton variant="ai-primary"><pc-icon name="sparkles" /> Generate artifacts</button>
          </div>
        </div>
        <div>
          <div class="kicker" style="margin-bottom: 8px">AI next to another main action — ai</div>
          <div class="row wrap gap-3">
            <button pcButton variant="primary"><pc-icon name="check" /> Approve plan</button>
            <button pcButton variant="ai"><pc-icon name="sparkles" /> Refine with AI</button>
            <button pcButton variant="ai" size="sm"><pc-icon name="sparkles" /> Summarize</button>
          </div>
        </div>
      </div>`,
  }),
};

export const Sizes: Story = {
  render: () => ({
    template: `
      <div class="row gap-3">
        <button pcButton size="sm">Small · 26</button>
        <button pcButton>Default · 32</button>
        <button pcButton size="lg">Large · 42 (rare)</button>
        <button pcButton variant="ghost" size="sm" [iconOnly]="true" aria-label="Settings"><pc-icon name="settings" /></button>
        <button pcButton variant="secondary" [iconOnly]="true" aria-label="Search"><pc-icon name="search" /></button>
      </div>`,
  }),
};
