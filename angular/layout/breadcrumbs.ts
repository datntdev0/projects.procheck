import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import type { TranslationKey } from '@shared/i18n/locales/en';

/** Route `data` read by the main layout. */
export interface LayoutRouteData {
  /** Translation key of the last breadcrumb. Omitted on the "Projects" home page itself. */
  crumb?: TranslationKey;
}

function deepestCrumb(route: ActivatedRouteSnapshot | null): TranslationKey | null {
  let crumb: TranslationKey | null = null;
  for (let r = route; r; r = r.firstChild) {
    const data = r.data as LayoutRouteData;
    if (data.crumb !== undefined) crumb = data.crumb;
  }
  return crumb;
}

/** Translation key of the current page crumb, as a signal. Must run in an injection context. */
export function injectCurrentCrumb() {
  const router = inject(Router);
  return toSignal(
    router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => deepestCrumb(router.routerState.snapshot.root)),
    ),
    { initialValue: deepestCrumb(router.routerState.snapshot.root) },
  );
}
