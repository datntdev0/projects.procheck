import type { TranslationKey } from '@shared/i18n/locales/en';

export type SettingsSectionId = 'about' | 'general' | 'diagnostics' | 'storage' | 'agents';

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: TranslationKey;
  icon: string;
}

export interface SettingsNavGroup {
  label: TranslationKey;
  items: SettingsNavItem[];
}

/** In-page navigation of the App settings page (order = section order on the page). */
export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'set.g.system',
    items: [
      { id: 'about', label: 'set.n.about', icon: 'info' },
      { id: 'general', label: 'set.n.general', icon: 'sliders-horizontal' },
      { id: 'diagnostics', label: 'set.n.diagnostics', icon: 'scroll-text' },
    ],
  },
  {
    label: 'set.g.data',
    items: [{ id: 'storage', label: 'set.n.storage', icon: 'hard-drive' }],
  },
  {
    label: 'set.g.agents',
    items: [{ id: 'agents', label: 'set.n.agents', icon: 'square-terminal' }],
  },
];

export const SETTINGS_SECTION_IDS: SettingsSectionId[] = SETTINGS_NAV.flatMap((g) => g.items.map((i) => i.id));
