import type { TranslationKey } from '@shared/i18n/locales/en';

/** App-level navigation shown in the sidebar and the search dialog. */
export interface NavItem {
  id: string;
  label: TranslationKey;
  icon: string;
  route: string;
}

export const MAIN_NAV: NavItem[] = [
  { id: 'projects', label: 'nav.all_projects', icon: 'layout-grid', route: '/projects' },
  { id: 'new-project', label: 'nav.new_project', icon: 'folder-plus', route: '/projects/new' },
  { id: 'open-project', label: 'nav.open_project', icon: 'folder-open', route: '/projects/open' },
];

export const SETTINGS_NAV: NavItem = { id: 'settings', label: 'nav.settings', icon: 'settings', route: '/settings' };
