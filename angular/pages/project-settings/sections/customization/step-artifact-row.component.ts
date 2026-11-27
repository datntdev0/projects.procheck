import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ArtifactView, fileSizeLabel } from './customization.model';

/**
 * One artifact of a step: name, Markdown template (attach, replace, remove, preview, restore the default, or drop
 * a file on the row) and remove. Presentational only: every change is emitted to the parent, which checks the file.
 */
@Component({
  selector: 'pc-step-artifact-row',
  imports: [ButtonComponent, IconComponent, InputDirective, TooltipDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fa',
    '[class.is-over]': 'dragOver()',
    '[attr.data-testid]': "'ps-fl-art-' + artifact().id",
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
  template: `
    <pc-icon class="fa-glyph" [name]="artifact().template ? 'file-badge' : 'file-text'" [size]="16" />
    <input
      pcInput
      data-testid="ps-fl-art-name"
      [invalid]="!artifact().name.trim()"
      [value]="artifact().name"
      [placeholder]="'ps.fl.name_ph' | t"
      (input)="rename.emit(text($event))"
    />

    @if (artifact().template; as file) {
      <div class="fa-file" data-testid="ps-fl-art-template">
        <pc-icon name="file-badge" [size]="14" />
        <span class="nm" [title]="file.name">{{ file.name }}</span>
        <span class="sz">{{ sizeLabel(file.size) }}</span>
        @if (file.pending) {
          <span class="tag is-pending" data-testid="ps-fl-art-pending">{{ 'ps.fl.pending' | t }}</span>
        } @else if (file.origin === 'default') {
          <span class="tag" data-testid="ps-fl-art-default">{{ 'ps.fl.default' | t }}</span>
        }
        @if (file.previewable) {
          <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [pcTooltip]="'ps.fl.preview' | t" data-testid="ps-fl-art-preview" (click)="preview.emit()">
            <pc-icon name="eye" />
          </button>
        }
        @if (artifact().canRestore) {
          <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [pcTooltip]="'ps.fl.restore' | t" data-testid="ps-fl-art-restore" (click)="restore.emit()">
            <pc-icon name="rotate-ccw" />
          </button>
        }
        <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [pcTooltip]="'ps.fl.replace' | t" (click)="picker.click()">
          <pc-icon name="replace" />
        </button>
        <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [pcTooltip]="'ps.fl.rmfile' | t" data-testid="ps-fl-art-unfile" (click)="removeTemplate.emit()">
          <pc-icon name="x" />
        </button>
      </div>
    } @else {
      <div class="fa-file">
        <button pcButton size="sm" type="button" class="fa-attach" data-testid="ps-fl-art-attach" (click)="picker.click()">
          <pc-icon name="paperclip" />{{ 'ps.fl.attach' | t }}
        </button>
        @if (artifact().canRestore) {
          <button pcButton variant="ghost" size="sm" type="button" data-testid="ps-fl-art-restore" (click)="restore.emit()">
            <pc-icon name="rotate-ccw" />{{ 'ps.fl.restore' | t }}
          </button>
        }
      </div>
    }

    <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [pcTooltip]="'ps.fl.rm' | t" data-testid="ps-fl-art-remove" (click)="remove.emit()">
      <pc-icon name="trash-2" />
    </button>
    <input #picker type="file" hidden accept=".md,text/markdown" (change)="onPick($event)" />
  `,
})
export class StepArtifactRowComponent {
  readonly artifact = input.required<ArtifactView>();

  readonly rename = output<string>();
  readonly attach = output<File>();
  readonly preview = output<void>();
  readonly restore = output<void>();
  readonly removeTemplate = output<void>();
  readonly remove = output<void>();

  protected readonly dragOver = signal(false);
  protected readonly sizeLabel = fileSizeLabel;

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onPick(event: Event): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    if (file) this.attach.emit(file);
    el.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    const host = event.currentTarget as HTMLElement;
    if (!host.contains(event.relatedTarget as Node | null)) this.dragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.attach.emit(file);
  }
}
