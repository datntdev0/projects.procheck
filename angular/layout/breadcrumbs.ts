import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import type { TranslationKey } from '@shared/i18n/locales/en';

/** Route `data` read by the main layout. */
export interface LayoutRouteData {
  /** Translation key of the last breadcrumb. Omitted on the "Projects" home page itself. */
  crumb?: TranslationKey;
  hideAssistant?: boolean;
}

type DataReader<T> = (data: LayoutRouteData) => T | undefined;

function deepest<T>(route: ActivatedRouteSnapshot | null, read: DataReader<T>, fallback: T): T {
  let value = fallback;
  for (let r = route; r; r = r.firstChild) {
    const found = read(r.data as LayoutRouteData);
    if (found !== undefined) value = found;
  }
  return value;
}

function injectRouteData<T>(read: DataReader<T>, fallback: T) {
  const router = inject(Router);
  const current = () => deepest(router.routerState.snapshot.root, read, fallback);
  return toSignal(
    router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(current),
    ),
    { initialValue: current() },
  );
}

/** Translation key of the current page crumb, as a signal. Must run in an injection context. */
export function injectCurrentCrumb() {
  return injectRouteData<TranslationKey | null>((data) => data.crumb, null);
}

/** True on pages that bring their own chat and hide the assistant panel. Must run in an injection context. */
export function injectAssistantHidden() {
  return injectRouteData((data) => data.hideAssistant, false);
}
