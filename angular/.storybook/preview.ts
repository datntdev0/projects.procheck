import '../styles.scss';

import type { Decorator, Preview } from '@storybook/angular-vite';

const withTheme: Decorator = (story, context) => {
  document.documentElement.setAttribute('data-theme', String(context.globals['theme'] ?? 'dark'));
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
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [withTheme],
};

export default preview;
