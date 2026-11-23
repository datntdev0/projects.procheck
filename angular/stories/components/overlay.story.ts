import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { FieldComponent } from '@components/form/field.component';
import { InputDirective } from '@components/form/input.directive';

const meta: Meta = {
  title: 'DESIGN SYSTEM/Components/Dialog',
  decorators: [moduleMetadata({ imports: [DialogComponent, DialogFooterDirective, ButtonComponent, FieldComponent, InputDirective] })],
};
export default meta;
type Story = StoryObj;

export const Dialog: Story = {
  render: () => ({
    props: { open: true },
    template: `
      <button pcButton variant="primary" (click)="open = true">Open dialog</button>
      <pc-dialog [(open)]="open" title="Rename project">
        <pc-field label="Project name" for="rn"><input pcInput id="rn" value="Lotus Pay — Merchant Portal" /></pc-field>
        <div class="modal-footer" pcDialogFooter>
          <button pcButton variant="ghost" (click)="open = false">Cancel</button>
          <button pcButton variant="primary" (click)="open = false">Save</button>
        </div>
      </pc-dialog>`,
  }),
};
