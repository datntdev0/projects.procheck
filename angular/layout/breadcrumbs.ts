import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/** Route `data` read by the main layout. */
export interface LayoutRouteData {
  /** Label of the last breadcrumb. Omitted on the "Projects" home page itself. */
  crumb?: string;
}

function deepestCrumb(route: ActivatedRouteSnapshot | null): string | null {
  let crumb: string | null = null;
  for (let r = route; r; r = r.firstChild) {
    const data = r.data as LayoutRouteData;
    if (data.crumb !== undefined) crumb = data.crumb;
  }
  return crumb;
}

/** Current page crumb as a signal. Must run in an injection context. */
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
