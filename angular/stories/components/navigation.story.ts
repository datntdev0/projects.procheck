import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { ButtonComponent } from '@components/button/button.component';
import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { IconComponent } from '@components/icon/icon.component';
import { MENU } from '@components/menu/menu.component';
import { StepperComponent } from '@components/stepper/stepper.component';
import { TabsComponent } from '@components/tabs/tabs.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';

const meta: Meta = {
  title: 'DESIGN SYSTEM/Components/Navigation',
  decorators: [
    moduleMetadata({ imports: [TabsComponent, ...MENU, DropdownComponent, ButtonComponent, IconComponent, StepperComponent, TooltipDirective] }),
  ],
};
export default meta;
type Story = StoryObj;

export const Tabs: Story = {
  render: () => ({
    props: {
      active: 'sources',
      items: [
        { id: 'sources', label: 'Sources', icon: 'folder', count: 5 },
        { id: 'artifacts', label: 'Artifacts', icon: 'file-text', count: 12 },
        { id: 'history', label: 'History', icon: 'history' },
      ],
    },
    template: `<pc-tabs [items]="items" [(active)]="active" /><p class="caption mt-4">active = {{ active }}</p>`,
  }),
};

export const Menu: Story = {
  render: () => ({
    template: `
      <pc-menu style="width: 240px">
        <pc-menu-label>Theme</pc-menu-label>
        <button pcMenuItem><pc-icon name="monitor" /> System</button>
        <button pcMenuItem [active]="true"><pc-icon name="sun" /> Light <pc-icon name="check" style="margin-left: auto" /></button>
        <button pcMenuItem><pc-icon name="moon" /> Dark</button>
        <pc-menu-separator />
        <button pcMenuItem><pc-icon name="settings" /> App settings</button>
      </pc-menu>`,
  }),
};

export const Dropdown: Story = {
  render: () => ({
    template: `
      <div style="height: 220px">
        <pc-dropdown>
          <button pcButton pcDropdownTrigger>Open menu <pc-icon name="chevron-down" /></button>
          <pc-menu style="width: 220px">
            <button pcMenuItem><pc-icon name="folder-plus" /> New project</button>
            <button pcMenuItem><pc-icon name="folder-open" /> Open project folder…</button>
            <pc-menu-separator />
            <button pcMenuItem><pc-icon name="settings" /> Settings</button>
          </pc-menu>
        </pc-dropdown>
      </div>`,
  }),
};

export const Stepper: Story = {
  render: () => ({
    template: `<pc-stepper [steps]="['Details', 'Sources', 'CLI', 'Review']" [current]="2" />`,
  }),
};

export const Tooltip: Story = {
  render: () => ({
    template: `
      <div class="row gap-3" style="padding-top: 40px">
        <button pcButton variant="ghost" [iconOnly]="true" pcTooltip="Search (Ctrl K)"><pc-icon name="search" /></button>
        <button pcButton variant="ghost" [iconOnly]="true" pcTooltip="Language"><pc-icon name="languages" /></button>
        <button pcButton variant="ghost" [iconOnly]="true" pcTooltip="Theme"><pc-icon name="sun-moon" /></button>
      </div>`,
  }),
};
