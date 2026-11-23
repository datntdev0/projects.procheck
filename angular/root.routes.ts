import { Routes } from '@angular/router';

import { LayoutRouteData } from '@layout/breadcrumbs';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { MainLayoutComponent } from '@layout/main-layout/main-layout.component';
import { ComingSoonPageComponent } from '@pages/coming-soon/coming-soon-page.component';
import { ProjectsPageComponent } from '@pages/projects/projects-page.component';

const crumb = (key: TranslationKey): LayoutRouteData => ({ crumb: key });

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'projects' },
      { path: 'projects', component: ProjectsPageComponent, title: 'Projects · Procheck' },
      { path: 'projects/new', component: ComingSoonPageComponent, data: crumb('nav.new_project'), title: 'New project · Procheck' },
      { path: 'projects/open', component: ComingSoonPageComponent, data: crumb('nav.open_project'), title: 'Open project · Procheck' },
      { path: 'settings', component: ComingSoonPageComponent, data: crumb('nav.settings'), title: 'Settings · Procheck' },
      { path: '**', component: ComingSoonPageComponent },
    ],
  },
];
