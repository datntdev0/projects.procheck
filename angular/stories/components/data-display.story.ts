import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { FileTileComponent } from '@components/file-tile/file-tile.component';
import { IconComponent } from '@components/icon/icon.component';
import { KbdComponent } from '@components/kbd/kbd.component';
import { PageHeaderComponent } from '@components/page-header/page-header.component';
import { ButtonComponent } from '@components/button/button.component';

const meta: Meta = {
  title: 'DESIGN SYSTEM/Components/Data display',
  decorators: [moduleMetadata({ imports: [FileTileComponent, IconComponent, KbdComponent, PageHeaderComponent, ButtonComponent] })],
};
export default meta;
type Story = StoryObj;

export const PageHeader: Story = {
  render: () => ({
    template: `
      <pc-page-header kicker="Initial phase" title="Requirements" subtitle="Collected from 3 meetings and 5 sources.">
        <button pcPageActions pcButton>Export</button>
        <button pcPageActions pcButton variant="primary">New artifact</button>
      </pc-page-header>`,
  }),
};

export const FileTiles: Story = {
  render: () => ({
    template: `
      <div class="row gap-3">
        <pc-file-tile kind="pdf" />
        <pc-file-tile kind="doc" />
        <pc-file-tile kind="sheet" />
        <pc-file-tile kind="md" />
        <pc-file-tile kind="audio" icon="message-circle" />
      </div>`,
  }),
};

export const Keyboard: Story = {
  render: () => ({
    template: `<div class="row gap-2 text-sm text-muted">Search <pc-kbd>Ctrl</pc-kbd><pc-kbd>K</pc-kbd> · Assistant <pc-kbd>Ctrl J</pc-kbd></div>`,
  }),
};

export const Table: Story = {
  render: () => ({
    template: `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Artifact</th><th>Type</th><th>Updated</th></tr></thead>
          <tbody>
            <tr><td class="row"><pc-file-tile kind="doc" /> Business requirements</td><td>BRD</td><td class="text-subtle">2h ago</td></tr>
            <tr><td class="row"><pc-file-tile kind="md" /> Scope statement</td><td>Scope</td><td class="text-subtle">Yesterday</td></tr>
          </tbody>
        </table>
      </div>`,
  }),
};
