import { computed, inject } from '@angular/core';

import { ProjectsService } from '@features/projects/projects.service';

import { injectRouteParam } from './breadcrumbs';

export const PROJECT_ID_PARAM = 'projectId';

/** Id in the URL of the project page being shown (`/projects/:projectId/…`), as a signal. */
export function injectCurrentProjectId() {
  return injectRouteParam(PROJECT_ID_PARAM);
}

/** The project of the current URL with a readable manifest, or `null` outside project pages. */
export function injectCurrentProject() {
  const id = injectCurrentProjectId();
  const projects = inject(ProjectsService);
  return computed(() => {
    const project = projects.find(id());
    return project?.manifest ? { ...project, manifest: project.manifest } : null;
  });
}
