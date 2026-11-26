import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { InputDirective } from '@components/form/input.directive';
import { SwitchComponent } from '@components/form/switch.component';
import { IconComponent } from '@components/icon/icon.component';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { StepConfig, StepDefinition } from './customization.model';
import { StepArtifactRowComponent } from './step-artifact-row.component';

/**
 * One step of a phase in Project settings → Customization, collapsible: free-text instructions for the
 * Assistant and the artifacts the step produces; optional steps have an on/off switch.
 * Presentational only: every change is emitted to the parent.
 */
@Component({
  selector: 'pc-step-config-card',
  imports: [ButtonComponent, IconComponent, InputDirective, StepArtifactRowComponent, SwitchComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'card fstep',
    '[class.is-open]': 'open()',
    '[class.is-off]': 'step().off',
    '[attr.data-testid]': "'ps-cz-step-' + step().id",
  },
  template: `
    <div class="fs-head">
      <button type="button" class="fs-toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        <span class="fs-n">{{ index() + 1 }}</span>
        <span class="fs-ico"><pc-icon [name]="definition().icon" [size]="15" /></span>
        <span class="fs-t">
          <b>{{ definition().name | t }}</b>
          <small>
            @if (step().off) {
              {{ 'ps.cz.skipped_d' | t }}
            } @else {
              {{ 'ps.fl.count' | t: { n: step().artifacts.length } }}@if (names()) {
                · {{ names() }}
              }
            }
          </small>
        </span>
        @if (step().instructions !== null) {
          <span class="tag">{{ 'ps.fl.custom' | t }}</span>
        }
      </button>
      @if (optional()) {
        <div class="fs-off">
          <span>{{ (step().off ? 'ps.cz.off' : 'ps.cz.on') | t }}</span>
          <pc-switch data-testid="ps-cz-step-switch" [checked]="!step().off" (checkedChange)="offChange.emit(!$event)" />
        </div>
      }
      <button type="button" class="fs-chev" [attr.aria-expanded]="open()" [attr.aria-label]="definition().name | t" (click)="open.set(!open())">
        <pc-icon name="chevron-down" [size]="16" class="chev" />
      </button>
    </div>

    @if (open()) {
      @if (step().off) {
        <div class="fs-skip">{{ 'ps.cz.skip_note' | t }}</div>
      }
      <div class="fs-body">
        <div class="fs-block">
          <div class="fs-block-head">
            <div class="sinfo">
              <div class="slabel">{{ 'ps.fl.instr' | t }}</div>
              <div class="sdesc">{{ 'ps.fl.instr.d' | t }}</div>
            </div>
            @if (step().instructions !== null) {
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
            [value]="instructionText()"
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
          @for (artifact of step().artifacts; track artifact.key; let n = $index) {
            <pc-step-artifact-row
              [artifact]="artifact"
              (rename)="renameArtifact.emit({ index: n, name: $event })"
              (attach)="attachTemplate.emit({ index: n, file: $event })"
              (removeTemplate)="removeTemplate.emit(n)"
              (remove)="removeArtifact.emit(n)"
            />
          } @empty {
            <div class="fa-none">{{ 'ps.fl.none' | t }}</div>
          }
        </div>
      </div>
    }
  `,
})
export class StepConfigCardComponent {
  readonly definition = input.required<StepDefinition>();
  readonly step = input.required<StepConfig>();
  readonly index = input.required<number>();
  /** Text shown in the textarea: the user's own, or the default in the current language. */
  readonly instructionText = input.required<string>();
  /** Hint under "Artifacts" (differs per phase). */
  readonly artifactsHint = input.required<string>();
  /** The step can be turned off. */
  readonly optional = input(false);
  readonly open = model(false);

  readonly instructionsChange = output<string>();
  readonly resetInstructions = output<void>();
  readonly offChange = output<boolean>();
  readonly addArtifact = output<void>();
  readonly renameArtifact = output<{ index: number; name: string }>();
  readonly attachTemplate = output<{ index: number; file: File }>();
  readonly removeTemplate = output<number>();
  readonly removeArtifact = output<number>();

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
