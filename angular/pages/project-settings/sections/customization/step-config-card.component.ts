import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { StepDefinition, StepView } from './customization.model';
import { StepArtifactRowComponent } from './step-artifact-row.component';

/**
 * One step of a phase in Project settings → Customization, collapsible: free-text instructions for the
 * Assistant and the artifacts the step produces.
 * Presentational only: every change is emitted to the parent.
 */
@Component({
  selector: 'pc-step-config-card',
  imports: [ButtonComponent, IconComponent, InputDirective, StepArtifactRowComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fstep',
    '[class.is-open]': 'open()',
    '[attr.data-testid]': "'ps-cz-step-' + step().id",
  },
  template: `
    <div class="fs-head">
      <button type="button" class="fs-toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        <span class="fs-n">{{ number() }}</span>
        <span class="fs-t">
          <b>{{ definition().name | t }}</b>
          <small>
            {{ 'ps.fl.count' | t: { n: step().artifacts.length } }}@if (names()) {
              · {{ names() }}
            }
          </small>
        </span>
        @if (step().custom) {
          <span class="tag">{{ 'ps.fl.custom' | t }}</span>
        }
      </button>
      <button type="button" class="fs-chev" [attr.aria-expanded]="open()" [attr.aria-label]="definition().name | t" (click)="open.set(!open())">
        <pc-icon name="chevron-down" [size]="16" class="chev" />
      </button>
    </div>

    @if (open()) {
      <div class="fs-body">
        <div class="fs-block">
          <div class="fs-block-head">
            <div class="sinfo">
              <div class="slabel">{{ 'ps.fl.instr' | t }}</div>
              <div class="sdesc">{{ 'ps.fl.instr.d' | t }}</div>
            </div>
            @if (step().custom) {
              <button pcButton variant="ghost" size="sm" type="button" data-testid="ps-fl-instr-reset" (click)="resetInstructions.emit()">
                <pc-icon name="rotate-ccw" />{{ 'ps.fl.instr.reset' | t }}
              </button>
            }
          </div>
          <textarea
            pcInput
            class="instr"
            spellcheck="false"
            data-testid="ps-fl-instr"
            [value]="step().instructions"
            (input)="instructionsChange.emit(text($event))"
          ></textarea>
        </div>

        <div class="fs-block">
          <div class="fs-block-head">
            <div class="sinfo">
              <div class="slabel">{{ 'ps.fl.arts' | t }}</div>
              <div class="sdesc">{{ artifactsHint() | t }}</div>
            </div>
            <button pcButton size="sm" type="button" data-testid="ps-fl-art-add" (click)="addArtifact.emit()">
              <pc-icon name="plus" />{{ 'ps.fl.add' | t }}
            </button>
          </div>
          <div class="fa-list">
            @for (artifact of step().artifacts; track artifact.id) {
              <pc-step-artifact-row
                [artifact]="artifact"
                (rename)="renameArtifact.emit({ id: artifact.id, name: $event })"
                (attach)="attachTemplate.emit({ id: artifact.id, file: $event })"
                (preview)="previewTemplate.emit(artifact.id)"
                (restore)="restoreTemplate.emit(artifact.id)"
                (removeTemplate)="removeTemplate.emit(artifact.id)"
                (remove)="removeArtifact.emit(artifact.id)"
              />
            } @empty {
              <div class="fa-none">{{ 'ps.fl.none' | t }}</div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class StepConfigCardComponent {
  readonly definition = input.required<StepDefinition>();
  readonly step = input.required<StepView>();
  readonly index = input.required<number>();
  /** Hint under "Artifacts" (differs per phase). */
  readonly artifactsHint = input.required<string>();
  readonly open = model(false);

  readonly instructionsChange = output<string>();
  readonly resetInstructions = output<void>();
  readonly addArtifact = output<void>();
  readonly renameArtifact = output<{ id: string; name: string }>();
  readonly attachTemplate = output<{ id: string; file: File }>();
  readonly previewTemplate = output<string>();
  readonly restoreTemplate = output<string>();
  readonly removeTemplate = output<string>();
  readonly removeArtifact = output<string>();

  /** Step number as shown in the step header: two-digit, plain mono. */
  protected readonly number = computed(() => String(this.index() + 1).padStart(2, '0'));

  protected readonly names = computed(() =>
    this.step()
      .artifacts.map((a) => a.name.trim())
      .filter(Boolean)
      .join(', '),
  );

  protected text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
