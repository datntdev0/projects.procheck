import { formatBytes } from '@shared/format/bytes';
import type { I18nService } from '@shared/i18n/i18n.service';

import { ToolProgressView } from './tools.model';

function eta(i18n: I18nService, seconds: number): string {
  return seconds >= 60
    ? i18n.t('sp.eta.min', { n: Math.ceil(seconds / 60) })
    : i18n.t('sp.eta.s', { n: Math.max(1, Math.round(seconds)) });
}

/** `12 MB of 62 MB · 6.1 MB/s · 8 s left` while downloading, else the name of the phase (Verifying…, Extracting…). */
export function progressLine(i18n: I18nService, view: ToolProgressView): string {
  if (!view.determinate) return i18n.t(`sp.s.${view.state}`);
  if (view.speed <= 0) return `${formatBytes(view.received)} / ${formatBytes(view.total)}`;
  return i18n.t('sp.prog', {
    r: formatBytes(view.received),
    t: formatBytes(view.total),
    s: formatBytes(view.speed),
    eta: eta(i18n, (view.total - view.received) / view.speed),
  });
}
