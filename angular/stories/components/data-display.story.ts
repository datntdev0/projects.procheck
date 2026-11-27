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

/** Flat page head: H1 22px, a meta line with plain glyphs, actions on the right and a bottom rule. No hero, no gradient. */
export const PageHeader: Story = {
  render: () => ({
    template: `
      <pc-page-header title="Lotus Pay — Merchant Portal">
        <span pcPageMeta><pc-icon name="folder" /><code class="text-xs">D:\\Projects\\lotus-pay</code></span>
        <span pcPageMeta><span class="phase-chip phase-release">Scaffolding</span></span>
        <span pcPageMeta><pc-icon name="clock" />Updated 12 min ago</span>
        <button pcPageActions pcButton><pc-icon name="upload" /> Upload</button>
        <button pcPageActions pcButton variant="ai-primary"><pc-icon name="sparkles" /> Generate plan</button>
      </pc-page-header>`,
  }),
};

export const PageHeaderWithKicker: Story = {
  render: () => ({
    template: `
      <pc-page-header kicker="Initial phase" title="Requirements" subtitle="Collected from 3 meetings and 5 sources.">
        <button pcPageActions pcButton>Export</button>
        <button pcPageActions pcButton variant="primary">New artifact</button>
      </pc-page-header>`,
  }),
};

/** In lists, files are divided rows with a plain neutral glyph and a status badge — no tinted tile per file. */
export const FileRows: Story = {
  render: () => ({
    template: `
      <div class="panel" style="max-width: 480px">
        <div class="panel-head"><h3>Sources</h3><span class="text-xs text-subtle">4 files</span></div>
        <div class="rows">
          <div class="row-item"><pc-file-tile kind="pdf" /><div class="grow"><div class="text-sm" style="font-weight: var(--weight-medium)">Client-brief.pdf</div><div class="text-xs text-subtle">PDF · 2.4 MB</div></div><span class="badge badge-success">Read</span></div>
          <div class="row-item"><pc-file-tile kind="doc" /><div class="grow"><div class="text-sm" style="font-weight: var(--weight-medium)">Requirements-v3.docx</div><div class="text-xs text-subtle">Word · 180 KB</div></div><span class="badge badge-success">Read</span></div>
          <div class="row-item"><pc-file-tile kind="sheet" icon="table" /><div class="grow"><div class="text-sm" style="font-weight: var(--weight-medium)">Feature-matrix.xlsx</div><div class="text-xs text-subtle">Sheet · 64 KB</div></div><span class="badge badge-warning">Conflict</span></div>
          <div class="row-item"><pc-file-tile kind="audio" icon="audio-lines" /><div class="grow"><div class="text-sm" style="font-weight: var(--weight-medium)">kickoff-meeting.m4a</div><div class="text-xs text-subtle">Audio · 38 min</div></div><span class="badge">Queued</span></div>
        </div>
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
