import { type Meta, type StoryObj, moduleMetadata } from '@storybook/angular-vite';

import { BadgeComponent } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { CARD, CardComponent } from '@components/card/card.component';
import { IconComponent } from '@components/icon/icon.component';
import { StatComponent, StatStripComponent } from '@components/stat/stat.component';

/**
 * A card is the same flat bordered panel as `.panel`: 1px border, radius 6, no shadow.
 * Never put a card inside a card; split its content with rules (`.panel-section`, `.rows > .row-item`)
 * and put figures in a `pc-stat-strip`.
 */
const meta: Meta<CardComponent> = {
  title: 'DESIGN SYSTEM/Components/Card',
  component: CardComponent,
  decorators: [moduleMetadata({ imports: [...CARD, ButtonComponent, BadgeComponent, IconComponent, StatComponent, StatStripComponent] })],
  args: { padded: true, interactive: false, flat: false, accent: '' },
  render: (args) => ({
    props: args,
    template: `
      <pc-card [padded]="padded" [interactive]="interactive" [flat]="flat" [accent]="accent" style="max-width: 360px">
        <h4>Lotus Pay — Merchant Portal</h4>
        <p class="text-sm text-muted" style="margin: 4px 0 0">Sprint 4 · LP-142 in human review</p>
      </pc-card>`,
  }),
};
export default meta;
type Story = StoryObj<CardComponent>;

export const Playground: Story = {};

export const WithSections: Story = {
  render: () => ({
    template: `
      <pc-card style="max-width: 440px">
        <pc-card-header><h4>Business requirements</h4><pc-badge tone="warning">In review</pc-badge></pc-card-header>
        <pc-card-body><p class="text-sm text-muted" style="margin: 0">BRD v1 generated from 3 meetings and 5 sources. 2 blocking questions remain.</p></pc-card-body>
        <pc-card-footer><button pcButton variant="ghost" size="sm">Later</button><button pcButton variant="primary" size="sm">Review</button></pc-card-footer>
      </pc-card>`,
  }),
};

/** Interactive cards change border and surface on hover (no lift); accent cards carry a 3px state edge. */
export const InteractiveAndAccent: Story = {
  render: () => ({
    template: `
      <div class="grid grid-2" style="max-width: 720px; align-items: start">
        <pc-card [padded]="true" [interactive]="true">
          <div class="row" style="gap: 10px; align-items: flex-start">
            <span class="text-subtle" style="display: inline-flex; margin-top: 2px"><pc-icon name="git-branch" /></span>
            <div class="grow"><div class="h5">Interactive card</div><div class="text-xs text-subtle">Selectable option or board card. Hover changes border and surface, no lift.</div></div>
          </div>
        </pc-card>
        <pc-card [padded]="true" accent="var(--phase-release)">
          <div class="h5">Accent card</div><div class="text-xs text-subtle">3px state or phase edge on the left</div>
        </pc-card>
      </div>`,
  }),
};

/** A row of figures is one strip with cells divided by rules — not one card per figure. */
export const Stats: Story = {
  render: () => ({
    template: `
      <pc-stat-strip [cols]="4">
        <pc-stat label="Active projects" value="5" delta="+1 this week" trend="up" />
        <pc-stat label="Waiting for you" value="7" sub="2 reviews · 5 questions" />
        <pc-stat label="Agent runs" value="3" delta="1 failed" trend="down" />
        <pc-stat label="Artifacts" value="42" sub="6 updated today" />
      </pc-stat-strip>`,
  }),
};

/** Panel with a head, divided rows, a key–value section and a footer. Nothing inside gets its own border box. */
export const PanelRowsAndKeyValue: Story = {
  render: () => ({
    template: `
      <div class="grid" style="grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: var(--space-4); align-items: start">
        <div class="panel">
          <div class="panel-head"><h3>Recent agent runs</h3><a class="text-xs" href="javascript:void(0)">View all</a></div>
          <div class="rows">
            <a class="row-item" href="javascript:void(0)">
              <span class="text-warning" style="display: inline-flex"><pc-icon name="eye" /></span>
              <div class="grow"><div class="text-sm" style="font-weight: var(--weight-medium); color: var(--fg-strong)">LP-142 · Merchant KYC upload</div><div class="text-xs text-subtle">Claude Code · e2e 12/12</div></div>
              <pc-badge tone="warning">In review</pc-badge>
            </a>
            <a class="row-item" href="javascript:void(0)">
              <span class="text-danger" style="display: inline-flex"><pc-icon name="circle-alert" /></span>
              <div class="grow"><div class="text-sm" style="font-weight: var(--weight-medium); color: var(--fg-strong)">LP-139 · Login rate limiting</div><div class="text-xs text-subtle">Codex · 2 tests failing</div></div>
              <pc-badge tone="danger">Failed</pc-badge>
            </a>
          </div>
          <div class="panel-foot"><button pcButton variant="ghost" size="sm">Dismiss</button><button pcButton size="sm"><pc-icon name="kanban" /> Open board</button></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Repository</h3><pc-badge tone="success"><pc-icon name="check" /> Linked</pc-badge></div>
          <div class="panel-section panel-body">
            <dl class="kv">
              <dt>Path</dt><dd><code>D:\\Projects\\lotus-pay</code></dd>
              <dt>Branch</dt><dd>main · 3 worktrees</dd>
              <dt>CLI</dt><dd>Claude Code 2.4.1</dd>
            </dl>
          </div>
          <div class="panel-section panel-body text-sm text-muted">Agents work in <code>.procheck\\worktrees\\</code>; your main branch is never touched.</div>
        </div>
      </div>`,
  }),
};
