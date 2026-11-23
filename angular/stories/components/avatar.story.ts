import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { AvatarComponent } from '@components/avatar/avatar.component';
import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';

const meta: Meta<AvatarComponent> = {
  title: 'DESIGN SYSTEM/Components/Avatar',
  component: AvatarComponent,
  decorators: [moduleMetadata({ imports: [AvatarComponent, ProjectAvatarComponent] })],
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  args: { initials: 'DN', size: 'md', ai: false },
  render: (args) => ({ props: args, template: `<pc-avatar [initials]="initials" [size]="size" [ai]="ai" />` }),
};
export default meta;
type Story = StoryObj<AvatarComponent>;

export const Playground: Story = {};

export const PeopleAndAgents: Story = {
  render: () => ({
    template: `
      <div class="row gap-4">
        <pc-avatar initials="DN" size="sm" />
        <pc-avatar initials="DN" />
        <pc-avatar initials="DN" size="lg" />
        <pc-avatar [ai]="true" size="sm" />
        <pc-avatar [ai]="true" />
        <pc-avatar [ai]="true" size="lg" icon="bot" />
      </div>`,
  }),
};

export const ProjectAvatars: Story = {
  render: () => ({
    template: `
      <div class="row gap-3">
        <pc-project-avatar short="LP" [size]="22" />
        <pc-project-avatar short="LP" />
        <pc-project-avatar short="MK" color="linear-gradient(135deg,#6A26F1,#FE006A)" [size]="40" />
        <pc-project-avatar short="AH" color="linear-gradient(135deg,#02CCB3,#006AFE)" [size]="48" />
      </div>`,
  }),
};
