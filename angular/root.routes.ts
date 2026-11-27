import { Type } from '@angular/core';
import { Route, Routes } from '@angular/router';

import { toolsGuard } from '@features/tools/tools.guard';
import { LayoutRouteData } from '@layout/breadcrumbs';
import { PROJECT_ID_PARAM } from '@layout/current-project';
import { PROJECT_PAGES, ProjectNavItem } from '@layout/navigation';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { MainLayoutComponent } from '@layout/main-layout/main-layout.component';
import { ArtifactsPageComponent } from '@pages/artifacts/artifacts-page.component';
import { ChatsPageComponent } from '@pages/chats/chats-page.component';
import { ComingSoonPageComponent } from '@pages/coming-soon/coming-soon-page.component';
import { InitialPhasePageComponent } from '@pages/initial-phase/initial-phase-page.component';
import { NewProjectPageComponent } from '@pages/new-project/new-project-page.component';
import { ProjectPageComponent } from '@pages/project/project-page.component';
import { ProjectOverviewPageComponent } from '@pages/project-overview/project-overview-page.component';
import { ProjectSettingsPageComponent } from '@pages/project-settings/project-settings-page.component';
import { ProjectsPageComponent } from '@pages/projects/projects-page.component';
import { SettingsPageComponent } from '@pages/settings/settings-page.component';
import { SourcesPageComponent } from '@pages/sources/sources-page.component';
import { SplashPageComponent } from '@pages/splash/splash-page.component';

const crumb = (key: TranslationKey): LayoutRouteData => ({ crumb: key });
const chatsData: LayoutRouteData = { crumb: 'nav.chats.all', hideAssistant: true };

/** Project pages that are built; the others show a coming-soon note. */
const PROJECT_PAGE_COMPONENTS: Partial<Record<string, Type<unknown>>> = {
  overview: ProjectOverviewPageComponent,
  artifacts: ArtifactsPageComponent,
  initial: InitialPhasePageComponent,
  settings: ProjectSettingsPageComponent,
  sources: SourcesPageComponent,
};

function projectPageRoute(page: ProjectNavItem): Route {
  const component = PROJECT_PAGE_COMPONENTS[page.segment] ?? ProjectPageComponent;
  return { path: page.segment, component, data: crumb(page.label), title: 'Project · Procheck' };
}

export const routes: Routes = [
  // Outside the app layout: no sidebar or topbar. The layout below sends here until Git is installed.
  { path: 'splash', component: SplashPageComponent, title: 'Procheck' },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [toolsGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'projects' },
      { path: 'projects', component: ProjectsPageComponent, title: 'Projects · Procheck' },
      { path: 'projects/new', component: NewProjectPageComponent, data: crumb('nav.new_project'), title: 'New project · Procheck' },
      { path: 'projects/open', component: ComingSoonPageComponent, data: crumb('nav.open_project'), title: 'Open project · Procheck' },
      {
        path: `projects/:${PROJECT_ID_PARAM}`,
        children: [{ path: '', pathMatch: 'full', redirectTo: 'overview' }, ...PROJECT_PAGES.map(projectPageRoute)],
      },
      { path: 'chats', component: ChatsPageComponent, data: chatsData, title: 'All chats · Procheck' },
      { path: 'chats/:id', component: ChatsPageComponent, data: chatsData, title: 'All chats · Procheck' },
      { path: 'settings', component: SettingsPageComponent, data: crumb('nav.settings'), title: 'Settings · Procheck' },
      { path: '**', component: ComingSoonPageComponent },
    ],
  },
];
