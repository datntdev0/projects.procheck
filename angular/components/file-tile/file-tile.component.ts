import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'md' | 'audio';

/** Coloured square icon for a file type. */
@Component({
  selector: 'pc-file-tile',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'file-tile ' + kind()" },
  template: `<pc-icon [name]="icon() || 'file-text'" />`,
})
export class FileTileComponent {
  readonly kind = input<FileKind>('doc');
  readonly icon = input('');
}
