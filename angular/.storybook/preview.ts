import '../styles.scss';

import { applicationConfig, type Decorator, type Preview } from '@storybook/angular-vite';

import { provideAppIcons } from '../shared/icons/app-icons';

const withTheme: Decorator = (story, context) => {
  document.documentElement.setAttribute('data-theme', String(context.globals['theme'] ?? 'light'));
  return story();
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    options: {
      storySort: { order: ['DESIGN SYSTEM', ['_Foundation', 'Components'], '*'] },
    },
  },
  decorators: [withTheme, applicationConfig({ providers: [provideAppIcons()] })],
};

export default preview;
