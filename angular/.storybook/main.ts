import type { StorybookConfig } from '@storybook/angular-vite';

const config: StorybookConfig = {
  stories: ['../stories/**/*.story.ts'],
  framework: {
    name: '@storybook/angular-vite',
    options: {},
  },
  // Same public path as the Angular build (`assets/**` → `/assets/**`).
  staticDirs: [{ from: '../assets', to: '/assets' }],
  core: {
    disableTelemetry: true,
  },
};

export default config;
