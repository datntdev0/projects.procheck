import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { BadgeComponent } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { IconComponent } from '@components/icon/icon.component';
import { formatDate } from '@shared/format/date';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { ARTIFACT_ICON, InitialStep, InitialStepId, STEP_BADGE, isApproved } from './initial-steps';

/** "Phase progress" section of the Initial phase overview (ported from `#s-steps` in _proto/initial.html). */
@Component({
  selector: 'pc-phase-progress',
  imports: [BadgeComponent, ButtonComponent, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'section', 'data-testid': 'phase-progress' },
  template: `
    <div class="sh">
      <div class="ttl">
        <span class="no"><pc-icon name="route" [size]="14" /></span>
        <div>
          <h3>{{ 'in.s1.title' | t }}</h3>
          <div class="sub">{{ 'in.s1.sub' | t: { a: approved(), n: total() } }}</div>
        </div>
      </div>
      <div class="row gap-2 wrap">
        <button pcButton variant="ghost" size="sm" type="button" (click)="configure.emit()">
          <pc-icon name="settings-2" [size]="14" />{{ 'in.s1.config' | t }}
        </button>
        <button pcButton size="sm" type="button" (click)="openArtifacts.emit()">
          <pc-icon name="files" [size]="14" />{{ 'in.s1.artifacts' | t }}
        </button>
      </div>
    </div>

    <div class="ph-steps">
      @for (step of steps(); track step.id; let i = $index, last = $last) {
        <div class="ph-step" [class]="'is-' + step.status" [attr.data-testid]="'phase-step-' + step.id">
          <div class="ph-top">
            <span class="ph-dot">
              @switch (step.status) {
                @case ('done') { <pc-icon name="check" [size]="14" /> }
                @case ('stale') { <pc-icon name="refresh-cw" [size]="14" /> }
                @default { {{ i + 1 }} }
              }
            </span>
            @if (!last) {
              <span class="ph-line"></span>
            }
          </div>
          <div class="ph-name">{{ 'in.step.' + step.id | t }}</div>
          <pc-badge [tone]="badge[step.status]">{{ 'in.st.' + step.status | t }}</pc-badge>
          <p class="ph-desc">{{ 'in.step.' + step.id + '.d' | t }}</p>

          <div class="ph-arts">
            @for (art of step.artifacts; track art.id) {
              <button
                type="button"
                class="ph-art"
                [class]="'is-' + (art.stale ? 'stale' : art.status)"
                [title]="art.version ? art.name + ' · v' + art.version : art.name"
                (click)="openArtifact.emit(art.id)"
              >
                <pc-icon [name]="art.stale ? 'refresh-cw' : artIcon[art.status]" [size]="12" />
                <span>{{ art.name }}</span>
              </button>
            }
          </div>

          <div class="ph-date">
            @if (step.artifacts.length) {
              {{ 'in.s1.approved' | t: { a: approvedIn(step), n: step.artifacts.length } }}
              @if (step.status === 'done' && step.doneAt) {
                · {{ date(step.doneAt) }}
              }
            } @else {
              —
            }
          </div>

          @if (step.artifacts.length) {
            <div class="ph-acts">
              <button
                pcButton
                size="sm"
                type="button"
                [variant]="step.id === recommended() ? 'primary' : 'ai'"
                [attr.data-testid]="'phase-step-generate-' + step.id"
                (click)="generate.emit(step.id)"
              >
                <pc-icon name="sparkles" [size]="14" />{{ (fresh(step) ? 'in.s1.gen' : 'in.s1.upd') | t }}
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PhaseProgressComponent {
  readonly steps = input.required<InitialStep[]>();

  /** Generate / update every artifact of a step with AI. */
  readonly generate = output<InitialStepId>();
  readonly openArtifact = output<string>();
  readonly openArtifacts = output<void>();
  readonly configure = output<void>();

  private readonly i18n = inject(I18nService);

  protected readonly badge = STEP_BADGE;
  protected readonly artIcon = ARTIFACT_ICON;

  protected readonly total = computed(() => this.steps().reduce((n, s) => n + s.artifacts.length, 0));
  protected readonly approved = computed(() => this.steps().reduce((n, s) => n + this.approvedIn(s), 0));
  /** The step holding the first artifact not started yet: its button is the primary one. */
  protected readonly recommended = computed(
    () => this.steps().find((s) => s.artifacts.some((a) => a.status === 'not_started'))?.id ?? null,
  );

  protected approvedIn(step: InitialStep): number {
    return step.artifacts.filter(isApproved).length;
  }

  protected fresh(step: InitialStep): boolean {
    return step.artifacts.every((a) => a.status === 'not_started');
  }

  protected date(iso: string): string {
    return formatDate(iso, this.i18n.lang());
  }
}
