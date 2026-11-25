import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { FileTileComponent } from '@components/file-tile/file-tile.component';
import { IconComponent } from '@components/icon/icon.component';
import { ProgressComponent, SpinnerComponent } from '@components/progress/progress.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { SOURCE_CATEGORIES, SourceCategory, SourceKind, SourceVisual, sourceVisual } from '@features/sources/sources.model';
import { formatBytes } from '@shared/format/bytes';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { SourceUpload } from './source-upload';
import { SourcesStore } from './sources-store';

/** Upload files dialog: pick or drop files and folders, review their kind and category, then add them. */
@Component({
  selector: 'pc-source-upload-dialog',
  imports: [ButtonComponent, DialogComponent, DialogFooterDirective, FileTileComponent, IconComponent, ProgressComponent, SpinnerComponent, TooltipDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pc-dialog [title]="'src.up.title' | t" width="min(640px, 100%)" [dismissible]="!upload.busy()" [open]="upload.open()" (openChange)="!$event && upload.close()">
      <div class="dropzone up-drop" data-testid="src-up-drop">
        <span class="dz-ico"><pc-icon name="upload" [size]="20" /></span>
        <b class="dz-title">{{ 'src.up.drop' | t }}</b>
        <span class="text-xs">{{ 'src.up.hint' | t }}</span>
        <div class="up-pick">
          <button pcButton size="sm" data-testid="src-up-files" [disabled]="upload.busy()" (click)="upload.pick(false)"><pc-icon name="files" /> {{ 'src.up.files' | t }}</button>
          <button pcButton size="sm" data-testid="src-up-folder" [disabled]="upload.busy()" (click)="upload.pick(true)"><pc-icon name="folder-open" /> {{ 'src.up.folder' | t }}</button>
        </div>
      </div>

      @if (upload.rows().length) {
        <div class="up-list" data-testid="src-up-list">
          @for (row of upload.rows(); track row.candidate.path) {
            @let c = row.candidate;
            <div class="up-row" data-testid="src-up-row" [class.is-bad]="!!c.problem">
              <pc-file-tile [kind]="visual(c.kind).tile" [icon]="visual(c.kind).icon" />
              <div style="min-width: 0">
                <div class="truncate" [title]="c.path">{{ c.relative }}</div>
                <div class="s">
                  @if (c.problem) {
                    <span class="text-danger">{{ 'src.up.p.' + c.problem | t }}</span>
                  } @else {
                    <span>{{ 'src.k.' + c.kind | t }} · {{ size(c.bytes) }}</span>
                    <span [class]="c.mode === 'store' ? 'text-warning' : 'text-success'">{{ 'src.m.' + c.mode | t }}</span>
                  }
                </div>
                @if (c.duplicateOf) {
                  <div class="s text-warning" data-testid="src-up-duplicate"><pc-icon name="copy" [size]="11" /> {{ 'src.up.dup' | t: { path: c.duplicateOf } }}</div>
                }
              </div>
              <select class="select" [disabled]="!!c.problem || upload.busy()" [value]="row.category" (change)="setCategory(c.path, $event)">
                @for (cat of categories; track cat) {
                  <option [value]="cat" [selected]="cat === row.category">{{ store.categoryLabel(cat) }}</option>
                }
              </select>
              <button pcButton variant="ghost" size="sm" [iconOnly]="true" [disabled]="upload.busy()" [pcTooltip]="'src.up.rm' | t" (click)="upload.remove(c.path)">
                <pc-icon name="x" />
              </button>
            </div>
          }
        </div>
        <div class="up-sum">
          <span data-testid="src-up-sum">{{ 'src.up.sum' | t: { n: upload.usable().length, r: upload.readableCount(), s: upload.storedCount() } }}</span>
        </div>
      } @else if (upload.inspecting()) {
        <div class="up-sum"><pc-spinner /> {{ 'src.up.reading' | t }}</div>
      }

      @if (upload.progress(); as step) {
        <div class="up-progress">
          <pc-progress [value]="upload.percent()" />
          <span class="text-xs text-subtle">{{ 'src.up.copying' | t: { name: step.name, i: step.index + 1, n: step.total } }}</span>
        </div>
      }

      <p class="up-note">{{ 'src.up.note' | t: { path: store.dir() } }}</p>

      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" [disabled]="upload.busy()" (click)="upload.close()">{{ 'common.cancel' | t }}</button>
        <button pcButton variant="primary" data-testid="src-up-go" [disabled]="!upload.usable().length || upload.busy()" (click)="upload.submit()">
          @if (upload.busy()) {
            <pc-spinner />
          } @else {
            <pc-icon name="upload" />
          }
          {{ upload.usable().length ? ('src.up.go' | t: { n: upload.usable().length }) : ('src.up.go0' | t) }}
        </button>
      </div>
    </pc-dialog>
  `,
})
export class SourceUploadDialogComponent {
  protected readonly upload = inject(SourceUpload);
  protected readonly store = inject(SourcesStore);
  protected readonly categories = SOURCE_CATEGORIES;

  protected visual(kind: SourceKind): SourceVisual {
    return sourceVisual(kind);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected setCategory(path: string, event: Event): void {
    this.upload.setCategory(path, (event.target as HTMLSelectElement).value as SourceCategory);
  }
}
