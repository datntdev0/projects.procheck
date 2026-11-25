import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent } from '@components/icon/icon.component';
import { SpinnerComponent } from '@components/progress/progress.component';
import { READ_MODE_ICONS, SourceAccess, SourceRecord, sourceAccess, sourceVisual } from '@features/sources/sources.model';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

type Tone = 'success' | 'muted' | 'danger' | '';

interface AccessView {
  icon: string;
  label: string;
  tone: Tone;
}

/** What the Assistant can read from a source: its read mode once indexed, or why not (yet). */
@Component({
  selector: 'pc-source-access',
  imports: [IconComponent, SpinnerComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'src-access ' + view().tone", '[attr.data-access]': 'access()' },
  template: `
    @if (access() === 'indexing') {
      <pc-spinner />
    } @else {
      <pc-icon [name]="view().icon" [size]="13" />
    }
    <span>{{ view().label | t }}</span>
  `,
})
export class SourceAccessComponent {
  readonly source = input.required<SourceRecord>();

  protected readonly access = computed<SourceAccess>(() => sourceAccess(this.source()));

  protected readonly view = computed<AccessView>(() => {
    const mode = sourceVisual(this.source().kind).mode;
    switch (this.access()) {
      case 'indexed':
        return { icon: READ_MODE_ICONS[mode], label: `src.m.${mode}`, tone: 'success' };
      case 'indexing':
        return { icon: '', label: `src.p.${mode}`, tone: '' };
      case 'queued':
        return { icon: 'clock', label: 'src.a.queued', tone: 'muted' };
      case 'stored':
        return { icon: 'archive', label: 'src.m.store', tone: 'muted' };
      case 'failed':
        return { icon: 'circle-alert', label: 'src.a.failed', tone: 'danger' };
      case 'missing':
        return { icon: 'triangle-alert', label: 'src.a.missing', tone: 'danger' };
    }
  });
}
