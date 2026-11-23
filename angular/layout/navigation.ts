/** App-level navigation shown in the sidebar and the search dialog. */
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

export const MAIN_NAV: NavItem[] = [
  { id: 'projects', label: 'All projects', icon: 'layout-grid', route: '/projects' },
  { id: 'new-project', label: 'New project', icon: 'folder-plus', route: '/projects/new' },
  { id: 'open-project', label: 'Open project', icon: 'folder-open', route: '/projects/open' },
];

export const SETTINGS_NAV: NavItem = { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings' };
