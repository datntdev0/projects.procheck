/* Static data for the Design System overview story (ported from _proto/DESIGN.html + app.js mock data). */

export type Phase = 'initial' | 'release' | 'sdlc';
export type SwatchKind = 'bg' | 'fg' | 'bd';

export interface TocItem { readonly id: string; readonly n: string; readonly label: string; }
export interface Swatch { readonly kind: SwatchKind; readonly token: string; readonly on?: string; }
export interface Project { readonly id: string; readonly name: string; readonly short: string; readonly phase: Phase; readonly color: string; readonly dir: string; }
export interface StorageItem { readonly path: string; readonly desc: string; readonly icon: string; readonly inside: boolean; }
export interface StorageCard { readonly cls: string; readonly icon: string; readonly title: string; readonly root: string; readonly items: readonly StorageItem[]; }
export interface PaletteItem { readonly group: string; readonly icon: string; readonly label: string; readonly go?: boolean; readonly action?: 'theme'; }

export const TOC: readonly TocItem[] = [
  { id: 'foundations', n: '01', label: 'Foundations' },
  { id: 'logo', n: '02', label: 'Logo' },
  { id: 'color', n: '03', label: 'Color' },
  { id: 'typography', n: '04', label: 'Typography' },
  { id: 'tokens', n: '05', label: 'Tokens' },
  { id: 'icons', n: '06', label: 'Iconography' },
  { id: 'components', n: '07', label: 'Components' },
  { id: 'patterns', n: '08', label: 'Patterns' },
  { id: 'dark', n: '09', label: 'Dark theme' },
  { id: 'a11y', n: '10', label: 'Accessibility' },
  { id: 'voice', n: '11', label: 'Voice' },
];

export const BLUE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export const GRAY_STEPS = [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950] as const;

/** Text tokens that are previewed on their paired background. */
const FG_ON: Readonly<Record<string, string>> = {
  'fg-on-brand': 'brand', 'fg-inverse': 'bg-inverse', 'diff-add-fg': 'diff-add-bg',
  'diff-del-fg': 'diff-del-bg', 'brand-fg': 'brand-soft', 'accent-teal-fg': 'accent-teal-soft',
};

/** Parses the prototype's `data-sw="bg:a,b;fg:c"` notation. */
function swatches(spec: string): readonly Swatch[] {
  return spec.split(';').flatMap((group) => {
    const [kind, list] = group.split(':') as [SwatchKind, string];
    return list.split(',').map((token) => ({ kind, token, on: kind === 'fg' ? FG_ON[token] : undefined }));
  });
}

export const SWATCH_GROUPS: readonly (readonly Swatch[])[] = [
  swatches('bg:bg-app,bg-canvas,bg-surface,bg-surface-2,bg-surface-3,bg-sunken,bg-hover,bg-active,bg-overlay,bg-sidebar,bg-topbar,bg-inverse'),
  swatches('fg:fg-default,fg-strong,fg-muted,fg-subtle,fg-faint,fg-on-brand,fg-inverse,fg-link'),
  swatches('bd:border-subtle,border-default,border-strong,border-focus'),
  swatches('bg:brand,brand-hover,brand-pressed,brand-soft,brand-soft-2;fg:brand-fg'),
  swatches('bg:accent-magenta,accent-magenta-soft,accent-purple,accent-purple-soft,accent-teal,accent-teal-soft,accent-sky,accent-sky-soft;fg:accent-teal-fg'),
  swatches('bg:code-bg,diff-add-bg,diff-del-bg;fg:diff-add-fg,diff-del-fg'),
];
export const SWATCH_TOKENS: readonly string[] = SWATCH_GROUPS.flat().map((s) => s.token);

/** Every semantic token copied onto the light / dark comparison panels. */
export const SEMANTIC_TOKENS: readonly string[] = [
  'bg-app', 'bg-canvas', 'bg-surface', 'bg-surface-2', 'bg-surface-3', 'bg-sunken', 'bg-hover', 'bg-active', 'bg-overlay', 'bg-sidebar', 'bg-topbar', 'bg-inverse',
  'fg-default', 'fg-strong', 'fg-muted', 'fg-subtle', 'fg-faint', 'fg-on-brand', 'fg-inverse', 'fg-link',
  'border-default', 'border-subtle', 'border-strong', 'border-focus',
  'brand', 'brand-hover', 'brand-pressed', 'brand-soft', 'brand-soft-2', 'brand-fg',
  'accent-magenta', 'accent-magenta-soft', 'accent-purple', 'accent-purple-soft', 'accent-teal', 'accent-teal-fg', 'accent-teal-soft', 'accent-sky', 'accent-sky-soft',
  'success', 'success-soft', 'success-fg', 'warning', 'warning-soft', 'warning-fg', 'danger', 'danger-soft', 'danger-fg', 'info', 'info-soft', 'info-fg',
  'phase-initial', 'phase-release', 'phase-sdlc',
  'shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-focus', 'gradient-brand', 'gradient-ai', 'gradient-hero',
  'code-bg', 'diff-add-bg', 'diff-add-fg', 'diff-del-bg', 'diff-del-fg',
];

/** Rows of the "Token mapping" table. */
export const MAP_TOKENS: readonly string[] = [
  'bg-app', 'bg-canvas', 'bg-surface', 'bg-surface-2', 'bg-sidebar', 'bg-topbar', 'fg-default', 'fg-muted', 'fg-subtle',
  'border-default', 'brand', 'brand-hover', 'brand-soft', 'brand-fg', 'fg-link', 'success', 'danger',
  'phase-initial', 'phase-release', 'phase-sdlc', 'code-bg',
];

/** [foreground, background] pairs of the live contrast table. */
export const CONTRAST_PAIRS: readonly (readonly [string, string])[] = [
  ['fg-default', 'bg-canvas'], ['fg-muted', 'bg-canvas'], ['fg-subtle', 'bg-canvas'], ['fg-faint', 'bg-canvas'],
  ['fg-on-brand', 'brand'], ['brand-fg', 'bg-canvas'], ['brand-fg', 'brand-soft'], ['fg-link', 'bg-canvas'],
  ['success-fg', 'success-soft'], ['warning-fg', 'warning-soft'], ['danger-fg', 'danger-soft'], ['accent-teal-fg', 'accent-teal-soft'],
  ['fg-inverse', 'bg-inverse'], ['kms-white', 'kms-blue'], ['kms-white', 'kms-magenta'], ['kms-white', 'kms-sky'],
];

export const ICON_GROUPS: readonly (readonly string[])[] = [
  ['layout-grid', 'folder-kanban', 'layout-dashboard', 'files', 'sparkles', 'git-branch', 'kanban', 'bot', 'search', 'settings', 'bell', 'palette'],
  ['compass', 'blocks', 'infinity', 'git-pull-request', 'git-merge', 'terminal', 'cpu', 'play', 'pause', 'square', 'flask-conical', 'clipboard-check'],
  ['file-text', 'upload', 'download', 'paperclip', 'at-sign', 'history', 'copy', 'pencil', 'trash-2', 'link', 'external-link', 'arrow-up'],
  ['check', 'circle-check', 'triangle-alert', 'circle-x', 'info', 'lock', 'shield-check', 'eye', 'loader-circle', 'x', 'plus', 'chevron-down'],
];

export const PHASE_LABEL: Readonly<Record<Phase, string>> = { initial: 'Initial', release: 'Scaffolding', sdlc: 'SDLC' };

export const PROJECTS: readonly Project[] = [
  { id: 'lotus-pay', name: 'Lotus Pay — Merchant Portal', short: 'LP', phase: 'sdlc', color: 'linear-gradient(135deg,#006AFE,#245DB3)', dir: 'D:\\Projects\\lotus-pay' },
  { id: 'mekong', name: 'Mekong Retail — Omnichannel', short: 'MR', phase: 'release', color: 'linear-gradient(135deg,#6A26F1,#006AFE)', dir: 'D:\\Projects\\mekong-omni' },
  { id: 'viethealth', name: 'VietHealth Telemedicine', short: 'VH', phase: 'initial', color: 'linear-gradient(135deg,#02CCB3,#006AFE)', dir: 'D:\\Projects\\viethealth' },
  { id: 'saigon-tms', name: 'Saigon Logistics TMS', short: 'SL', phase: 'initial', color: 'linear-gradient(135deg,#FE006A,#6A26F1)', dir: 'C:\\Users\\me\\Documents\\saigon-tms' },
  { id: 'atlas-hr', name: 'Atlas HR Suite', short: 'AH', phase: 'sdlc', color: 'linear-gradient(135deg,#245DB3,#62CCFE)', dir: 'D:\\Projects\\atlas-hr' },
];

/** Project shown in the breadcrumb / sidebar demos. */
export const DEMO_PROJECT: Project = PROJECTS[1];
/** "Current" project of the prototype (used for the storage and worktree paths). */
export const CURRENT_PROJECT: Project = PROJECTS[0];

export const AGENTS = [
  { id: 'claude', name: 'Claude Code', initials: 'CC' },
  { id: 'codex', name: 'Codex', initials: 'CX' },
] as const;

function storageItems(items: readonly (readonly [string, string])[]): readonly StorageItem[] {
  return items.map(([path, desc]) => ({ path, desc, icon: path.endsWith('\\') ? 'folder' : 'file-json', inside: path.startsWith('.procheck') }));
}

export const STORAGE_CARDS: readonly StorageCard[] = [
  {
    cls: 'st-app', icon: 'hard-drive', title: 'Application data', root: '%LOCALAPPDATA%\\Procheck',
    items: storageItems([
      ['settings.json', 'App preferences: theme, language, defaults'],
      ['projects.json', 'Registry of known project directories (recent list)'],
      ['cli\\', 'CLI tool registrations & auth'],
      ['logs\\', 'Application & harness logs'],
      ['cache\\', 'Indexes, thumbnails, temp files (safe to delete)'],
    ]),
  },
  {
    cls: 'project', icon: 'folder-open', title: 'Project data', root: CURRENT_PROJECT.dir,
    items: storageItems([
      ['procheck.json', 'Project manifest: name, client, phase, linked repo'],
      ['sources\\', 'Uploaded documents (inputs)'],
      ['artifacts\\', 'Generated & edited artifacts with versions'],
      ['board\\', 'Tasks, plans, review evidence'],
      ['.procheck\\chats\\', 'Assistant chat history'],
      ['.procheck\\runs\\', 'Agent run logs & evidence'],
      ['.procheck\\home\\<cli>\\', 'Isolated HOME for each CLI tool'],
      ['.procheck\\worktrees\\', 'Git worktrees created by agents'],
      ['.procheck\\settings.json', 'Project-level overrides (CLI, model, harness)'],
    ]),
  },
];

export const PALETTE_ITEMS: readonly PaletteItem[] = [
  { group: 'Go to', icon: 'layout-grid', label: 'Projects', go: true },
  { group: 'Go to', icon: 'layout-dashboard', label: 'Overview', go: true },
  { group: 'Go to', icon: 'files', label: 'Artifacts', go: true },
  { group: 'Go to', icon: 'sparkles', label: 'Assistant', go: true },
  { group: 'Go to', icon: 'compass', label: 'Initial phase', go: true },
  { group: 'Go to', icon: 'blocks', label: 'Scaffolding', go: true },
  { group: 'Go to', icon: 'kanban', label: 'SDLC board', go: true },
  { group: 'Go to', icon: 'bot', label: 'Task detail', go: true },
  { group: 'Go to', icon: 'sliders-horizontal', label: 'Project settings', go: true },
  { group: 'Go to', icon: 'settings', label: 'App settings', go: true },
  { group: 'Go to', icon: 'palette', label: 'Design system', go: true },
  { group: 'Actions', icon: 'plus', label: 'New project', go: true },
  { group: 'Actions', icon: 'sun-moon', label: 'Toggle theme', action: 'theme' },
  { group: 'Actions', icon: 'languages', label: 'Switch language (EN / VI)' },
  { group: 'Actions', icon: 'sparkles', label: 'Toggle assistant' },
];

export type ToastTone = 'success' | 'warning' | 'danger';

export const DEMO_TOASTS: Readonly<Record<ToastTone | 'default', { readonly message: string; readonly icon: string }>> = {
  success: { message: 'Saved to the project', icon: 'circle-check' },
  warning: { message: 'Review required before promoting', icon: 'triangle-alert' },
  danger: { message: 'Agent run failed', icon: 'circle-x' },
  default: { message: 'Copied to clipboard', icon: 'copy' },
};
