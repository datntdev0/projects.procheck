import type { StorybookConfig } from '@storybook/angular-vite';

const config: StorybookConfig = {
  stories: ['../stories/**/*.story.ts'],
  framework: {
    name: '@storybook/angular-vite',
    options: {},
  },
  staticDirs: ['../assets'],
  core: {
    disableTelemetry: true,
  },
};

export default config;
