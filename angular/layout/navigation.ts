import type { Phase } from '@components/badge/phase-chip.component';
import type { TranslationKey } from '@shared/i18n/locales/en';

/** App-level navigation shown in the sidebar and the search dialog. */
export interface NavItem {
  id: string;
  label: TranslationKey;
  icon: string;
  route: string;
  matchChildren?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { id: 'projects', label: 'nav.all_projects', icon: 'layout-grid', route: '/projects' },
  { id: 'new-project', label: 'nav.new_project', icon: 'folder-plus', route: '/projects/new' },
  { id: 'open-project', label: 'nav.open_project', icon: 'folder-open', route: '/projects/open' },
  { id: 'chats', label: 'nav.chats.all', icon: 'messages-square', route: '/chats', matchChildren: true },
];

export const SETTINGS_NAV: NavItem = { id: 'settings', label: 'nav.settings', icon: 'settings', route: '/settings' };

/** Page of a project, at `/projects/:projectId/<segment>`. */
export interface ProjectNavItem {
  segment: string;
  label: TranslationKey;
  icon: string;
  phase?: Phase;
}

export interface ProjectNavGroup {
  label: TranslationKey;
  items: ProjectNavItem[];
}

export const PROJECT_NAV: ProjectNavGroup[] = [
  {
    label: 'nav.project',
    items: [
      { segment: 'overview', label: 'nav.overview', icon: 'layout-dashboard' },
      { segment: 'artifacts', label: 'nav.artifacts', icon: 'files' },
      { segment: 'sources', label: 'nav.sources', icon: 'folder-input' },
    ],
  },
  {
    label: 'nav.workflow',
    items: [
      { segment: 'initial', label: 'nav.initial', icon: 'compass', phase: 'initial' },
      { segment: 'scaffolding', label: 'nav.scaffolding', icon: 'blocks', phase: 'release' },
      { segment: 'board', label: 'nav.board', icon: 'kanban', phase: 'sdlc' },
      { segment: 'runs', label: 'nav.runs', icon: 'bot' },
    ],
  },
];

export const PROJECT_SETTINGS_NAV: ProjectNavItem = { segment: 'settings', label: 'nav.project_settings', icon: 'sliders-horizontal' };

export const PROJECT_PAGES: ProjectNavItem[] = [...PROJECT_NAV.flatMap((group) => group.items), PROJECT_SETTINGS_NAV];
