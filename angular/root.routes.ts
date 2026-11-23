import { Routes } from '@angular/router';

import { LayoutRouteData } from '@layout/breadcrumbs';
import { MainLayoutComponent } from '@layout/main-layout/main-layout.component';
import { ComingSoonPageComponent } from '@pages/coming-soon/coming-soon-page.component';
import { ProjectsPageComponent } from '@pages/projects/projects-page.component';

const crumb = (label: string): LayoutRouteData => ({ crumb: label });

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'projects' },
      { path: 'projects', component: ProjectsPageComponent, title: 'Projects · Procheck' },
      { path: 'projects/new', component: ComingSoonPageComponent, data: crumb('New project'), title: 'New project · Procheck' },
      { path: 'projects/open', component: ComingSoonPageComponent, data: crumb('Open project'), title: 'Open project · Procheck' },
      { path: 'settings', component: ComingSoonPageComponent, data: crumb('Settings'), title: 'Settings · Procheck' },
      { path: '**', component: ComingSoonPageComponent, data: crumb('Page') },
    ],
  },
];
