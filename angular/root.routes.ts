import { Route, Routes } from '@angular/router';

import { LayoutRouteData } from '@layout/breadcrumbs';
import { PROJECT_ID_PARAM } from '@layout/current-project';
import { PROJECT_PAGES, ProjectNavItem } from '@layout/navigation';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { MainLayoutComponent } from '@layout/main-layout/main-layout.component';
import { ChatsPageComponent } from '@pages/chats/chats-page.component';
import { ComingSoonPageComponent } from '@pages/coming-soon/coming-soon-page.component';
import { NewProjectPageComponent } from '@pages/new-project/new-project-page.component';
import { ProjectPageComponent } from '@pages/project/project-page.component';
import { ProjectsPageComponent } from '@pages/projects/projects-page.component';
import { SettingsPageComponent } from '@pages/settings/settings-page.component';

const crumb = (key: TranslationKey): LayoutRouteData => ({ crumb: key });
const chatsData: LayoutRouteData = { crumb: 'nav.chats.all', hideAssistant: true };

function projectPageRoute(page: ProjectNavItem): Route {
  return { path: page.segment, component: ProjectPageComponent, data: crumb(page.label), title: 'Project · Procheck' };
}

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
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
