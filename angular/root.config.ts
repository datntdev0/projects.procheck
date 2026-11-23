import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { provideAppIcons } from '@shared/icons/app-icons';

import { routes } from './root.routes';

export const rootConfig: ApplicationConfig = {
  // Hash routing: the Tauri asset protocol serves files, not an SPA fallback.
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes, withHashLocation()), provideAppIcons()],
};
