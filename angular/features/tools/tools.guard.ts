import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ToolsStore } from './tools.store';

/**
 * Keeps the app behind the splash screen until Git is installed. Checked once per app start: when Git has been
 * seen ready, navigation is free for the rest of the run.
 */
export const toolsGuard: CanActivateFn = async () => {
  const tools = inject(ToolsStore);
  const router = inject(Router);
  if (tools.gitReadySeen()) return true;
  await tools.check();
  return tools.gitReady() ? true : router.createUrlTree(['/splash']);
};
