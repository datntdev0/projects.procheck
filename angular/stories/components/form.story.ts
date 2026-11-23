import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { CheckboxComponent } from '@components/form/checkbox.component';
import { FieldComponent } from '@components/form/field.component';
import { InputDirective } from '@components/form/input.directive';
import { SegmentedComponent } from '@components/form/segmented.component';
import { SwitchComponent } from '@components/form/switch.component';
import { IconComponent } from '@components/icon/icon.component';
import { KbdComponent } from '@components/kbd/kbd.component';

const meta: Meta = {
  title: 'DESIGN SYSTEM/Components/Form',
  decorators: [
    moduleMetadata({
      imports: [FieldComponent, InputDirective, CheckboxComponent, SwitchComponent, SegmentedComponent, IconComponent, KbdComponent],
    }),
  ],
};
export default meta;
type Story = StoryObj;

export const Fields: Story = {
  render: () => ({
    template: `
      <div class="grid grid-2" style="max-width: 720px">
        <pc-field label="Project name" for="f1" hint="Shown in the sidebar and exports.">
          <input pcInput id="f1" placeholder="e.g. Lotus Pay — Merchant Portal" />
        </pc-field>
        <pc-field label="Project folder" for="f2" error="Folder not found. Choose an existing directory.">
          <input pcInput id="f2" [invalid]="true" value="D:/work/missing" />
        </pc-field>
        <pc-field label="Default CLI" for="f3">
          <select pcInput id="f3"><option>Claude Code</option><option>Codex</option></select>
        </pc-field>
        <pc-field label="Search" for="f5">
          <div class="input-group">
            <pc-icon name="search" />
            <input pcInput id="f5" placeholder="Search projects…" />
            <pc-kbd>Ctrl K</pc-kbd>
          </div>
        </pc-field>
        <pc-field label="Project brief" for="f4" style="grid-column: 1 / -1">
          <textarea pcInput id="f4" placeholder="Describe the client, goals and constraints…"></textarea>
        </pc-field>
      </div>`,
  }),
};

export const Toggles: Story = {
  render: () => ({
    props: { checked: true, on: true, mode: 'ask' },
    template: `
      <div class="col gap-4" style="align-items: flex-start">
        <pc-checkbox [(checked)]="checked">Export with comments ({{ checked ? 'on' : 'off' }})</pc-checkbox>
        <pc-switch [(checked)]="on">Isolate CLI HOME directory</pc-switch>
        <pc-switch [disabled]="true">Disabled</pc-switch>
        <pc-segmented
          [(value)]="mode"
          [options]="[{ value: 'ask', label: 'Ask', icon: 'message-circle' }, { value: 'edit', label: 'Edit' }, { value: 'agent', label: 'Agent', icon: 'bot' }]"
        />
        <span class="caption">mode = {{ mode }}</span>
      </div>`,
  }),
};
