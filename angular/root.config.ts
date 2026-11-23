import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { provideAgentConnections } from '@features/agents/agent-connections.service';
import { provideDiagnostics } from '@features/diagnostics/diagnostics.service';
import { provideAppSettings } from '@features/settings/app-settings.service';
import { provideAppIcons } from '@shared/icons/app-icons';
import { provideTheme } from '@shared/theme/theme.service';

import { routes } from './root.routes';

export const rootConfig: ApplicationConfig = {
  // Hash routing: the Tauri asset protocol serves files, not an SPA fallback.
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideDiagnostics(),
    provideRouter(routes, withHashLocation()),
    provideAppIcons(),
    provideTheme(),
    provideAppSettings(),
    provideAgentConnections(),
  ],
};
